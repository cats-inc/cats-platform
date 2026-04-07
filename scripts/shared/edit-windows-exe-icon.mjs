#!/usr/bin/env node

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { rcedit } from 'rcedit';

export function buildWindowsExecutableEditOptions({
  executablePath,
  iconPath,
  productName,
  copyright,
  shortVersion,
  buildVersion,
  shortVersionWindows,
  weirdWindowsVersion,
  companyName,
  internalName,
  requestedExecutionLevel,
}) {
  const options = {
    'version-string': {
      FileDescription: productName,
      ProductName: productName,
      LegalCopyright: copyright,
    },
    'file-version': shortVersion ?? buildVersion,
    'product-version': shortVersionWindows ?? weirdWindowsVersion,
    icon: iconPath,
  };

  if (internalName) {
    options['version-string'].InternalName = internalName;
    options['version-string'].OriginalFilename = '';
  }

  if (requestedExecutionLevel && requestedExecutionLevel !== 'asInvoker') {
    options['requested-execution-level'] = requestedExecutionLevel;
  }

  if (companyName) {
    options['version-string'].CompanyName = companyName;
  }

  return {
    executablePath,
    options,
  };
}

export function resolveWindowsExecutableEditPlan(context) {
  if (context.electronPlatformName !== 'win32') {
    return null;
  }

  const executablePath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`,
  );
  const iconPath = join(context.packager.buildResourcesDir, 'icon.ico');
  return buildWindowsExecutableEditOptions({
    executablePath,
    iconPath,
    productName: context.packager.appInfo.productName,
    copyright: context.packager.appInfo.copyright,
    shortVersion: context.packager.appInfo.shortVersion,
    buildVersion: context.packager.appInfo.buildVersion,
    shortVersionWindows: context.packager.appInfo.shortVersionWindows,
    weirdWindowsVersion: context.packager.appInfo.getVersionInWeirdWindowsForm(),
    companyName: context.packager.appInfo.companyName,
    internalName: context.packager.appInfo.productFilename,
    requestedExecutionLevel: context.packager.platformSpecificBuildOptions.requestedExecutionLevel,
  });
}

export default async function editWindowsExecutableIcon(context) {
  const plan = resolveWindowsExecutableEditPlan(context);
  if (plan === null) {
    return;
  }

  await access(plan.executablePath);
  await access(plan.options.icon);
  await rcedit(plan.executablePath, plan.options);
}
