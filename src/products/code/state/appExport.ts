import { execFile as execFileCallback } from 'node:child_process';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  CATS_CODE_APP_EXPORT_METADATA_FILE,
  CATS_CODE_USER_APP_TEMPLATE_PACKAGE_PATH,
  createCatsCodeAppExportMetadata,
  createCatsCodeUserAppTemplateManifest,
  type CatsCodeAppExportMetadata,
  type CreateCatsCodeUserAppTemplateManifestInput,
} from '../shared/appExport.js';
import type { CatsAppManifestV1 } from '../../../shared/catsAppManifest.js';
import {
  parseCatsAppManifestV1,
  type CatsAppManifestValidationOptions,
} from '../../../shared/catsAppValidation.js';

const execFile = promisify(execFileCallback);
const CATS_APP_MANIFEST_FILE = 'cats.app.json';

export interface CatsCodeUserAppPackageBuildResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
}

export interface ExportCatsCodeUserAppPackageInput
  extends CreateCatsCodeUserAppTemplateManifestInput {
  packagePath: string;
  templatePath?: string;
  overwrite?: boolean;
  runBuild?: boolean;
  buildCommand?: string;
  buildArgs?: string[];
  buildTimeoutMs?: number;
  createdAt?: Date;
  validationOptions?: CatsAppManifestValidationOptions;
}

export interface ExportCatsCodeUserAppPackageResult {
  packagePath: string;
  manifestPath: string;
  metadataPath: string;
  manifest: CatsAppManifestV1;
  metadata: CatsCodeAppExportMetadata;
  build: CatsCodeUserAppPackageBuildResult | null;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function defaultBuildCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function quoteWindowsCommandArgument(value: string): string {
  if (value.length === 0) {
    return '""';
  }
  if (!/[\s"&()<>^|]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/(["^])/gu, '^$1')}"`;
}

async function writeJsonFile(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runPackageBuild(
  packagePath: string,
  input: ExportCatsCodeUserAppPackageInput,
): Promise<CatsCodeUserAppPackageBuildResult> {
  const command = input.buildCommand ?? defaultBuildCommand();
  const args = input.buildArgs ?? ['run', 'build'];
  const execCommand = process.platform === 'win32'
    ? process.env.ComSpec ?? 'cmd.exe'
    : command;
  const execArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...args].map(quoteWindowsCommandArgument).join(' ')]
    : args;
  const result = await execFile(execCommand, execArgs, {
    cwd: packagePath,
    encoding: 'utf8',
    timeout: input.buildTimeoutMs ?? 120_000,
    windowsHide: true,
  });

  return {
    command,
    args,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function assertTemplateIsReadable(templatePath: string): Promise<void> {
  const templateStats = await stat(templatePath);
  if (!templateStats.isDirectory()) {
    throw new Error(`Cats Code app template must be a directory: ${templatePath}`);
  }
}

function createValidatedManifest(
  input: ExportCatsCodeUserAppPackageInput,
): CatsAppManifestV1 {
  const manifest = createCatsCodeUserAppTemplateManifest(input);
  const parsed = parseCatsAppManifestV1(manifest, input.validationOptions);
  if (!parsed.ok) {
    throw new Error(`Cats Code app manifest is invalid: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.manifest;
}

export async function exportCatsCodeUserAppPackage(
  input: ExportCatsCodeUserAppPackageInput,
): Promise<ExportCatsCodeUserAppPackageResult> {
  const packagePath = path.resolve(input.packagePath);
  const templatePath = path.resolve(
    input.templatePath ?? CATS_CODE_USER_APP_TEMPLATE_PACKAGE_PATH,
  );

  await assertTemplateIsReadable(templatePath);
  if (await pathExists(packagePath)) {
    if (!input.overwrite) {
      throw new Error(`Cats Code app export target already exists: ${packagePath}`);
    }
    await rm(packagePath, { recursive: true, force: true });
  }

  await mkdir(path.dirname(packagePath), { recursive: true });
  await cp(templatePath, packagePath, { recursive: true });

  const manifest = createValidatedManifest(input);
  const manifestPath = path.join(packagePath, CATS_APP_MANIFEST_FILE);
  await writeJsonFile(manifestPath, manifest);

  const build = input.runBuild === false
    ? null
    : await runPackageBuild(packagePath, input);

  const metadata = createCatsCodeAppExportMetadata({
    manifest,
    packagePath,
    createdAt: input.createdAt,
  });
  const metadataPath = path.join(packagePath, CATS_CODE_APP_EXPORT_METADATA_FILE);
  await writeJsonFile(metadataPath, metadata);

  return {
    packagePath,
    manifestPath,
    metadataPath,
    manifest,
    metadata,
    build,
  };
}
