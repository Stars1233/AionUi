#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取构建参数
const args = process.argv.slice(2);

// 从 electron-builder.yml 读取目标架构配置（简单的文本解析，避免依赖 js-yaml）
function getTargetArchesFromConfig(platform) {
  try {
    const configPath = path.resolve(__dirname, '../electron-builder.yml');
    const content = fs.readFileSync(configPath, 'utf8');

    // 查找平台配置块（如 "linux:"）
    const platformRegex = new RegExp(`^${platform}:\\s*$`, 'm');
    const platformMatch = content.match(platformRegex);
    if (!platformMatch) {
      return [];
    }

    // 提取平台配置块（从 "linux:" 到下一个顶级键或文件末尾）
    // 顶级键的特征：行首无缩进 + 键名 + 冒号
    const platformStartIndex = platformMatch.index;
    const afterPlatform = content.slice(platformStartIndex + platformMatch[0].length);
    const nextPlatformMatch = afterPlatform.match(/^[a-zA-Z][a-zA-Z0-9]*:/m);
    const platformBlock = nextPlatformMatch
      ? content.slice(platformStartIndex, platformStartIndex + platformMatch[0].length + nextPlatformMatch.index)
      : content.slice(platformStartIndex);

    // 查找所有 arch: [ xxx ] 或 arch: [xxx, yyy] 模式
    // 示例：arch: [ arm64 ] 或 arch: [x64, arm64] 或 arch: [ x64, arm64 ]
    const archMatches = platformBlock.matchAll(/arch:\s*\[\s*([a-z0-9_, ]+)\s*\]/gi);
    const allArches = new Set();

    for (const match of archMatches) {
      // 分割多个架构（如 "x64, arm64"）
      const arches = match[1]
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a);
      arches.forEach((a) => allArches.add(a));
    }

    return Array.from(allArches);
  } catch (error) {
    console.warn(`⚠️  Failed to read target arches from electron-builder.yml: ${error.message}`);
    return [];
  }
}

// 确定目标架构（单个或多个）
const builderArgs = args.slice(1).join(' ');
let targetArches = []; // 所有需要构建的架构
let buildMachineArch = process.arch; // 构建机器的架构

if (args[0] === 'auto') {
  // auto 模式：从 electron-builder.yml 读取所有目标架构
  let detectedPlatform = null;
  if (builderArgs.includes('--linux')) detectedPlatform = 'linux';
  else if (builderArgs.includes('--mac')) detectedPlatform = 'mac';
  else if (builderArgs.includes('--win')) detectedPlatform = 'win';

  const configArches = detectedPlatform ? getTargetArchesFromConfig(detectedPlatform) : [];
  targetArches = configArches.length > 0 ? configArches : [buildMachineArch];

  if (configArches.length > 0) {
    console.log(`🔍 Detected target architectures from electron-builder.yml: ${targetArches.join(', ')}`);
  } else {
    console.log(`🔍 Using build machine architecture: ${buildMachineArch}`);
  }
} else {
  targetArches = [args[0] || buildMachineArch];
}

const packageJsonPath = path.resolve(__dirname, '../package.json');

try {
  // 1. 确保 main 字段正确用于 Forge
  console.log('🔧 Ensuring main entry is correct for Forge...');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const originalMain = packageJson.main;
  
  // 添加进程退出监听器确保恢复
  const restoreMain = () => {
    try {
      const currentPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      currentPackageJson.main = '.webpack/main';
      fs.writeFileSync(packageJsonPath, JSON.stringify(currentPackageJson, null, 2) + '\n');
      console.log('🔄 Main entry restored on exit');
    } catch (e) {
      console.error('Failed to restore on exit:', e.message);
    }
  };
  
  process.on('SIGINT', restoreMain);
  process.on('SIGTERM', restoreMain);
  process.on('exit', restoreMain);
  
  // 确保 Forge 能找到正确的 main 入口
  if (packageJson.main !== '.webpack/main') {
    packageJson.main = '.webpack/main';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('📝 Reset main entry to .webpack/main for Forge');
  }

  // 2. 运行 Forge 打包
  console.log(`📦 Running Forge package for ${arch}...`);
  console.log(`🔍 Setting ELECTRON_BUILDER_ARCH=${arch}`);
  // Pass target architecture to Forge via environment variable
  const forgeEnv = { ...process.env, ELECTRON_BUILDER_ARCH: arch };
  execSync('npm run package', { stdio: 'inherit', env: forgeEnv });

  // 2.5 验证 Forge 输出的架构
  const webpackBaseDir = path.resolve(__dirname, '../.webpack');
  const webpackDirs = fs.readdirSync(webpackBaseDir).filter(d =>
    fs.statSync(path.join(webpackBaseDir, d)).isDirectory()
  );
  console.log(`🔍 Forge generated directories: ${webpackDirs.join(', ')}`);

  // 检测架构目录：通过检查是否包含 main/index.js 来判断是否为有效的 Forge 输出目录
  const archDirs = webpackDirs.filter(d => {
    const mainIndexPath = path.join(webpackBaseDir, d, 'main', 'index.js');
    return fs.existsSync(mainIndexPath);
  });

  console.log(`🔍 Valid Forge build directories (with main/index.js): ${archDirs.length > 0 ? archDirs.join(', ') : 'none'}`);

  // 确定实际生成的架构目录（Forge 实际输出的架构）
  let actualArch = arch; // 默认假设 Forge 生成了目标架构
  if (archDirs.length > 0) {
    // 如果存在多个架构目录，通过检查 main/index.js 的修改时间来确定最新的
    if (archDirs.length > 1) {
      console.log(`🔍 Multiple build directories found, detecting latest by timestamp...`);

      let latestArch = archDirs[0];
      let latestTime = 0;

      for (const archDir of archDirs) {
        const mainIndexPath = path.join(webpackBaseDir, archDir, 'main', 'index.js');
        const stats = fs.statSync(mainIndexPath);
        if (stats.mtimeMs > latestTime) {
          latestTime = stats.mtimeMs;
          latestArch = archDir;
        }
      }

      actualArch = latestArch;
      console.log(`✅ Detected latest build: ${actualArch} (modified: ${new Date(latestTime).toISOString()})`);
    } else {
      actualArch = archDirs[0];
    }
  }

  // 2.6 确保所有目标架构的 .webpack/${arch} 目录都存在供 electron-builder 使用
  // Forge 可能输出在 .webpack/${actualArch}/ 但 electron-builder 需要 .webpack/${targetArch}/
  const webpackSrcDir = path.resolve(__dirname, '../.webpack');
  const actualArchDir = path.join(webpackSrcDir, actualArch);
  const useArchSpecificSource = fs.existsSync(actualArchDir);

  // 为每个目标架构创建目录结构
  for (const targetArch of targetArches) {
    console.log(`📁 Preparing .webpack/${targetArch} directory for electron-builder...`);
    const webpackArchDir = path.resolve(__dirname, `../.webpack/${targetArch}`);

    // 如果目标架构目录不存在，或者需要从不同架构复制，则创建
    if (!fs.existsSync(webpackArchDir) || actualArch !== targetArch) {
      if (actualArch !== targetArch) {
        console.log(`⚠️  Cross-arch build: Forge generated ${actualArch} but target is ${targetArch}`);
        console.log(`📝 Will copy from ${actualArch} to ${targetArch}`);
      }
    // 复制必要的子目录（main, renderer, native_modules）
    if (process.platform === 'win32') {
      // Windows: 使用 xcopy 或 robocopy 复制子目录
      const mainSrc = useArchSpecificSource ? path.join(actualArchDir, 'main') : path.join(webpackSrcDir, 'main');
      const rendererSrc = useArchSpecificSource
        ? path.join(actualArchDir, 'renderer')
        : path.join(webpackSrcDir, 'renderer');
      const nativeModulesSrc = useArchSpecificSource
        ? path.join(actualArchDir, 'native_modules')
        : path.join(webpackSrcDir, 'native_modules');

      const mainDest = path.join(webpackArchDir, 'main');
      const rendererDest = path.join(webpackArchDir, 'renderer');
      const nativeModulesDest = path.join(webpackArchDir, 'native_modules');

      // 创建目标目录
      if (!fs.existsSync(webpackArchDir)) {
        fs.mkdirSync(webpackArchDir, { recursive: true });
      }

      // Copy main directory
      if (fs.existsSync(mainSrc)) {
        execSync(`xcopy "${mainSrc}" "${mainDest}" /E /I /H /Y /Q`, { stdio: 'inherit' });
        console.log(`✅ Copied main: ${mainSrc} -> ${mainDest}`);
      } else {
        console.warn(`⚠️  Main source not found at ${mainSrc}`);
      }

      // Copy renderer directory
      if (fs.existsSync(rendererSrc)) {
        execSync(`xcopy "${rendererSrc}" "${rendererDest}" /E /I /H /Y /Q`, { stdio: 'inherit' });
        console.log(`✅ Copied renderer: ${rendererSrc} -> ${rendererDest}`);
      } else {
        console.warn(`⚠️  Renderer source not found at ${rendererSrc}`);
      }

      // Copy native_modules directory
      if (fs.existsSync(nativeModulesSrc)) {
        execSync(`xcopy "${nativeModulesSrc}" "${nativeModulesDest}" /E /I /H /Y /Q`, { stdio: 'inherit' });
        console.log(`✅ Copied native_modules: ${nativeModulesSrc} -> ${nativeModulesDest}`);
      } else {
        console.warn(`⚠️  Native modules source not found at ${nativeModulesSrc}`);
      }
    } else {
      // Unix: 复制目录（而不是软链接，因为 asar 不支持软链接）
      // 源路径：Forge 可能生成 .webpack/${actualArch}/xxx 或 .webpack/xxx
      const mainSrc = useArchSpecificSource ? path.join(actualArchDir, 'main') : path.join(webpackSrcDir, 'main');
      const rendererSrc = useArchSpecificSource
        ? path.join(actualArchDir, 'renderer')
        : path.join(webpackSrcDir, 'renderer');
      const nativeModulesSrc = useArchSpecificSource
        ? path.join(actualArchDir, 'native_modules')
        : path.join(webpackSrcDir, 'native_modules');

      const mainDest = path.join(webpackArchDir, 'main');
      const rendererDest = path.join(webpackArchDir, 'renderer');
      const nativeModulesDest = path.join(webpackArchDir, 'native_modules');

      fs.mkdirSync(webpackArchDir, { recursive: true });

      // Copy main directory
      if (fs.existsSync(mainSrc)) {
        const absMainSrc = path.resolve(mainSrc);
        const absMainDest = path.resolve(mainDest);
        execSync(`cp -r "${absMainSrc}" "${absMainDest}"`, { stdio: 'inherit' });
        console.log(`✅ Copied main: ${absMainSrc} -> ${absMainDest}`);
      } else {
        console.warn(`⚠️  Main source not found at ${mainSrc}`);
      }

      // Copy renderer directory (for extraResources)
      if (fs.existsSync(rendererSrc)) {
        const absRendererSrc = path.resolve(rendererSrc);
        const absRendererDest = path.resolve(rendererDest);
        execSync(`cp -r "${absRendererSrc}" "${absRendererDest}"`, { stdio: 'inherit' });
        console.log(`✅ Copied renderer: ${absRendererSrc} -> ${absRendererDest}`);
      } else {
        console.warn(`⚠️  Renderer source not found at ${rendererSrc}`);
      }

      // Copy native_modules directory (for extraResources)
      if (fs.existsSync(nativeModulesSrc)) {
        const absNativeModulesSrc = path.resolve(nativeModulesSrc);
        const absNativeModulesDest = path.resolve(nativeModulesDest);
        execSync(`cp -r "${absNativeModulesSrc}" "${absNativeModulesDest}"`, { stdio: 'inherit' });
        console.log(`✅ Copied native_modules: ${absNativeModulesSrc} -> ${absNativeModulesDest}`);
      } else {
        console.warn(`⚠️  Native modules source not found at ${nativeModulesSrc}`);
      }
    }
      console.log(`✅ Created .webpack/${targetArch} structure from ${actualArch}`);
    }
  }

  // 3. 更新 main 字段用于 electron-builder
  // 使用 Forge 实际编译的架构作为主入口（确保文件存在）
  console.log(`🔧 Updating main entry for ${actualArch}...`);
  const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  updatedPackageJson.main = `.webpack/${actualArch}/main/index.js`;
  fs.writeFileSync(packageJsonPath, JSON.stringify(updatedPackageJson, null, 2) + '\n');

  // 4. 运行 electron-builder
  // 在非release环境下禁用发布以避免GH_TOKEN错误
  const isRelease = process.env.GITHUB_REF && process.env.GITHUB_REF.startsWith('refs/tags/v');
  const publishArg = isRelease ? '' : '--publish=never';
  console.log(`🚀 Running electron-builder ${builderArgs} ${publishArg}...`);
  execSync(`npx electron-builder ${builderArgs} ${publishArg}`, { stdio: 'inherit' });

  // 5. 恢复 main 字段
  console.log('🔄 Restoring main entry...');
  const finalPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  finalPackageJson.main = '.webpack/main';  // 确保恢复到正确的默认值
  fs.writeFileSync(packageJsonPath, JSON.stringify(finalPackageJson, null, 2) + '\n');

  console.log('✅ Build completed successfully!');
} catch (error) {
  // 出错时也要恢复 main 字段
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageJson.main = '.webpack/main';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  } catch (e) {
    console.error('Failed to restore package.json:', e.message);
  }
  
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}