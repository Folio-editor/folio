// electron-builder afterPack 훅 — 패키징 직후 main 바이너리에 Electron Fuses 적용.
// 기존 @electron-forge/plugin-fuses 가 자동으로 처리하던 보안 옵션을 동등 적용한다.
// builder는 이 훅 다음에 코드 사이닝 단계를 진행하므로, 사이닝이 fuse 비트를 깨지 않는다.
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  const productFilename = packager.appInfo.productFilename;

  const ext =
    electronPlatformName === 'darwin'
      ? '.app'
      : electronPlatformName === 'win32'
        ? '.exe'
        : '';
  const exe = path.join(appOutDir, `${productFilename}${ext}`);

  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};
