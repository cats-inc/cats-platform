import { randomBytes } from 'node:crypto';
import type { BrowserWindow } from 'electron';

export interface CandidateScreenshot {
  png: Buffer;
  frameId: string;
  width: number;
  height: number;
}

const viewportScript = `({ width: innerWidth, height: innerHeight,
  editable: (() => { const el = document.activeElement;
    return !!el && !el.disabled && !el.readOnly && (el.tagName === 'TEXTAREA'
      || (el.tagName === 'INPUT' && ['text','search','email','url','tel','password','number'].includes(el.type))
      || el.isContentEditable); })() })`;

const keys: Record<string, [string, string, number]> = {
  Enter: ['Enter', 'Enter', 13], Tab: ['Tab', 'Tab', 9], Escape: ['Escape', 'Escape', 27],
  Backspace: ['Backspace', 'Backspace', 8], Delete: ['Delete', 'Delete', 46],
  ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowUp: ['ArrowUp', 'ArrowUp', 38],
  ArrowRight: ['ArrowRight', 'ArrowRight', 39], ArrowDown: ['ArrowDown', 'ArrowDown', 40],
  Home: ['Home', 'Home', 36], End: ['End', 'End', 35],
  PageUp: ['PageUp', 'PageUp', 33], PageDown: ['PageDown', 'PageDown', 34],
  SelectAll: ['a', 'KeyA', 65],
};

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Candidate input timed out; observe again.')), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

/** Fixed input into one candidate webContents; never activates an OS window. */
export function createDesktopCandidateInteraction(window: BrowserWindow, options: {
  allowedUrl(url: string): boolean;
  stopping(): boolean;
  now?: () => number;
}) {
  const contents = window.webContents;
  const now = options.now ?? Date.now;
  let epoch = 0;
  let busy = false;
  let frame: (Omit<CandidateScreenshot, 'png'> & { epoch: number; url: string; at: number;
    viewport: { width: number; height: number }; zoom: number }) | null = null;
  const invalidate = () => { epoch += 1; frame = null; };
  contents.on('did-start-navigation', invalidate);
  contents.on('destroyed', invalidate);
  window.on('resize', invalidate);

  function available() {
    if (options.stopping() || window.isDestroyed() || contents.isDestroyed()
      || contents.isLoading() || !options.allowedUrl(contents.getURL())) {
      throw new Error('Candidate window is unavailable; observe again.');
    }
  }

  async function viewport() {
    const value: unknown = await bounded(contents.executeJavaScript(viewportScript));
    if (!value || typeof value !== 'object') throw new Error('Candidate viewport unavailable.');
    const result = value as { width: number; height: number; editable: boolean };
    if (!Number.isFinite(result.width) || !Number.isFinite(result.height)
      || result.width <= 0 || result.height <= 0) throw new Error('Candidate viewport unavailable.');
    return result;
  }

  return {
    invalidate,
    async screenshot(): Promise<CandidateScreenshot> {
      if (busy) throw new Error('Candidate input is busy.');
      busy = true;
      invalidate();
      try {
        available();
        const observedEpoch = epoch;
        const url = contents.getURL();
        const zoom = contents.getZoomFactor();
        const dimensions = await viewport();
        const png = (await bounded(contents.capturePage())).toPNG();
        available();
        if (epoch !== observedEpoch || url !== contents.getURL() || zoom !== contents.getZoomFactor()) {
          throw new Error('Candidate changed while capturing; observe again.');
        }
        // PNG dimensions, not DIP/native-image metadata: input coordinates are
        // pixels in the exact file delivered to the agent, including Retina/DPI.
        if (png.length < 24) throw new Error('Candidate image is empty.');
        const width = png.readUInt32BE(16);
        const height = png.readUInt32BE(20);
        if (!width || !height) throw new Error('Candidate image is empty.');
        const result = { png, frameId: randomBytes(16).toString('hex'), width, height };
        frame = { frameId: result.frameId, width, height, epoch, url, at: now(), viewport: dimensions, zoom };
        return result;
      } finally { busy = false; }
    },
    async input(value: unknown): Promise<void> {
      if (busy) throw new Error('Candidate input is busy.');
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid candidate input.');
      const action = value as Record<string, unknown>;
      const observed = frame;
      if (!observed || action.frameId !== observed.frameId || now() - observed.at > 120_000) {
        throw new Error('Candidate frame expired or changed; observe again.');
      }
      // Consume synchronously, before any asynchronous renderer/protocol call.
      frame = null;
      busy = true;
      let attached = false;
      const detached = () => { attached = false; };
      let release: Record<string, unknown> | null = null;
      let releaseMethod = '';
      const debugger_ = contents.debugger;
      const check = () => {
        available();
        if (epoch !== observed.epoch || contents.getURL() !== observed.url
          || contents.getZoomFactor() !== observed.zoom) throw new Error('Candidate changed; observe again.');
      };
      const send = async (method: string, parameters: Record<string, unknown>) => {
        check();
        if (!attached) throw new Error('Candidate debugger disconnected; observe again.');
        await bounded(debugger_.sendCommand(method, parameters));
      };
      const pressKey = async (name: string) => {
        const [key, code, windowsVirtualKeyCode] = keys[name]!;
        const parameters = { key, code, windowsVirtualKeyCode,
          modifiers: name === 'SelectAll' ? (process.platform === 'darwin' ? 4 : 2) : 0 };
        releaseMethod = 'Input.dispatchKeyEvent';
        release = { ...parameters, type: 'keyUp' };
        await send(releaseMethod, { ...parameters, type: 'keyDown',
          ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
        await send(releaseMethod, release);
        release = null;
      };
      try {
        check();
        const fields: Record<string, string[]> = { click: ['x', 'y'], scroll: ['x', 'y', 'deltaY'],
          text: ['text', 'replace'], key: ['key'] };
        if (typeof action.kind !== 'string' || !Object.hasOwn(fields, action.kind)
          || Object.keys(action).some((key) => !['kind', 'frameId', 'instanceId', ...fields[action.kind as string]!].includes(key))) {
          throw new Error('Invalid candidate input.');
        }
        const dimensions = await viewport();
        check();
        if (dimensions.width !== observed.viewport.width || dimensions.height !== observed.viewport.height) {
          throw new Error('Candidate viewport changed; observe again.');
        }
        if (debugger_.isAttached() || contents.isDevToolsOpened()) throw new Error('Candidate debugger is already in use.');
        debugger_.attach('1.3');
        attached = true;
        debugger_.on('detach', detached);
        if (action.kind === 'click' || action.kind === 'scroll') {
          if (typeof action.x !== 'number' || typeof action.y !== 'number'
            || !Number.isFinite(action.x) || !Number.isFinite(action.y)
            || action.x < 0 || action.y < 0 || action.x >= observed.width || action.y >= observed.height) {
            throw new Error('Candidate coordinates are outside the captured image.');
          }
          const position = { x: action.x * dimensions.width / observed.width,
            y: action.y * dimensions.height / observed.height };
          if (action.kind === 'scroll') {
            if (typeof action.deltaY !== 'number' || !Number.isFinite(action.deltaY) || Math.abs(action.deltaY) > 2000) {
              throw new Error('Invalid candidate scroll distance.');
            }
            await send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...position, deltaX: 0, deltaY: action.deltaY });
          } else {
            releaseMethod = 'Input.dispatchMouseEvent';
            release = { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 };
            await send(releaseMethod, { ...release, type: 'mousePressed' });
            await send(releaseMethod, release);
            release = null;
          }
        } else if (action.kind === 'text') {
          if (typeof action.text !== 'string' || action.text.length > 4096
            || (action.replace !== undefined && typeof action.replace !== 'boolean') || !dimensions.editable) {
            throw new Error('Text input requires a focused editable field and at most 4096 characters.');
          }
          if (action.replace) await pressKey('SelectAll');
          if (action.replace && action.text === '') await pressKey('Backspace');
          else await send('Input.insertText', { text: action.text });
        } else {
          if (typeof action.key !== 'string' || !Object.hasOwn(keys, action.key)) throw new Error('Unsupported candidate key.');
          await pressKey(action.key);
        }
      } finally {
        try {
          if (attached && release) await bounded(debugger_.sendCommand(releaseMethod, release)).catch(() => undefined);
          if (attached && debugger_.isAttached()) debugger_.detach();
        } finally {
          debugger_.off('detach', detached);
          busy = false;
        }
      }
    },
  };
}
