import {
  useEffect,
  useRef,
} from 'react';

export function useOnGenericDraftRouteEntry(
  isGenericDraftRoute: boolean,
  onEnterGenericDraftRoute: () => void,
  genericDraftRouteKey: string = '__generic__',
): void {
  const previousGenericDraftRouteKey = useRef<string | null>(null);

  useEffect(() => {
    const nextGenericDraftRouteKey = isGenericDraftRoute ? genericDraftRouteKey : null;
    const shouldRunEntryReset =
      nextGenericDraftRouteKey != null
      && previousGenericDraftRouteKey.current !== nextGenericDraftRouteKey;
    previousGenericDraftRouteKey.current = nextGenericDraftRouteKey;

    if (!shouldRunEntryReset) {
      return;
    }

    onEnterGenericDraftRoute();
  }, [genericDraftRouteKey, isGenericDraftRoute, onEnterGenericDraftRoute]);
}
