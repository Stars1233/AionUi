#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 获取构建参数
const args = process.argv.slice(2);
const arch = args[0] === 'auto' ? process.arch : args[0] || process.arch;
const builderArgs = args.slice(1).join(' ');

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
  console.log('📦 Running Forge package...');
  // Pass target architecture to Forge via environment variable
  const forgeEnv = { ...process.env, ELECTRON_BUILDER_ARCH: arch };
  execSync('npm run package', { stdio: 'inherit', env: forgeEnv });

  // 2.5 确保 .webpack/${arch} 目录存在供 electron-builder extraResources 使用
  // Forge 输出在 .webpack/ 但 electron-builder 需要 .webpack/${arch}/
  console.log(`📁 Preparing .webpack/${arch} directory for electron-builder...`);
  const webpackSrcDir = path.resolve(__dirname, '../.webpack');
  const webpackArchDir = path.resolve(__dirname, `../.webpack/${arch}`);

  // 如果 .webpack/${arch} 不存在，创建软链接或复制
  if (!fs.existsSync(webpackArchDir)) {
    // 在 Unix 系统使用软链接，Windows 使用目录复制
    if (process.platform === 'win32') {
      // Windows: 复制目录
      execSync(`xcopy "${webpackSrcDir}" "${webpackArchDir}" /E /I /H /Y`, { stdio: 'inherit' });
    } else {
      // Unix: 创建软链接（更快）
      const rendererSrc = path.join(webpackSrcDir, 'renderer');
      const nativeModulesSrc = path.join(webpackSrcDir, 'native_modules');
      const rendererDest = path.join(webpackArchDir, 'renderer');
      const nativeModulesDest = path.join(webpackArchDir, 'native_modules');

      fs.mkdirSync(webpackArchDir, { recursive: true });
      if (fs.existsSync(rendererSrc)) {
        execSync(`ln -sf "${rendererSrc}" "${rendererDest}"`, { stdio: 'inherit' });
      }
      if (fs.existsSync(nativeModulesSrc)) {
        execSync(`ln -sf "${nativeModulesSrc}" "${nativeModulesDest}"`, { stdio: 'inherit' });
      }
    }
    console.log(`✅ Created .webpack/${arch} structure`);
  }

  // 3. 更新 main 字段用于 electron-builder
  console.log(`🔧 Updating main entry for ${arch}...`);
  const updatedPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  updatedPackageJson.main = `.webpack/${arch}/main/index.js`;
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