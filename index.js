const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Package NodeGUI application into standalone application
 * @param {Object} options Packaging configuration
 * @param {string} options.appName Application name
 * @param {string} options.sourceDir Source directory path
 * @param {string} options.outputDir Output directory path
 * @param {string} options.mainFile Main file name (default: 'main.js')
 * @param {string[]} options.additionalModules List of additional npm modules
 */
async function packageApp(options) {
  // Set default configuration
  const config = {
    appName: options.appName || 'NodeGUIApp',
    sourceDir: options.sourceDir || process.cwd(),
    outputDir: options.outputDir || path.join(process.cwd(), 'deploy'),
    mainFile: options.mainFile || 'main.js',
    additionalModules: options.additionalModules || [],
  };

  // Resolve absolute paths to avoid path-related issues
  const sourceDirAbs = path.resolve(config.sourceDir);
  const outputDirAbs = path.resolve(config.outputDir);
  const appDirAbs = path.join(outputDirAbs, config.appName);
  
  // Check if output directory is inside source directory, which would cause circular copying
  const isOutputInSource = appDirAbs.startsWith(sourceDirAbs + path.sep) || appDirAbs === sourceDirAbs;
  
  const NODE_MODULES = path.join(sourceDirAbs, 'node_modules');
  const NODEGUI_PATH = path.join(NODE_MODULES, '@nodegui', 'nodegui');
  const QODE_PATH = path.join(NODE_MODULES, '@nodegui', 'qode', 'binaries', 'qode.exe');
  const MINIQT_PATH = path.join(NODEGUI_PATH, 'miniqt');

  try {
    console.log(`Starting packaging process for ${config.appName}...`);
    console.log('Using qode from:', QODE_PATH);
    
    // Create output directory
    const appDir = appDirAbs;
    await fs.ensureDir(appDir);
    await fs.emptyDir(appDir);
    
    // Copy project files - improved approach to avoid recursive copying
    console.log('Copying project files...');
    const ignoredDirs = [
      'node_modules', 
      '.git', 
      '.github',
      'coverage',
      '.vscode',
      '.idea'
    ];
    
    // Add output directory to ignored dirs
    if (isOutputInSource) {
      const relativeOutputPath = path.relative(sourceDirAbs, outputDirAbs);
      if (relativeOutputPath) {
        ignoredDirs.push(relativeOutputPath);
        console.log(`Detected output inside source directory, excluding: ${relativeOutputPath}`);
      }
    }

    // Manual recursive copy implementation to avoid fs-extra's limitation
    async function copyDirRecursive(src, dest) {
      // Read source directory contents
      const entries = await fs.readdir(src, { withFileTypes: true });
      
      // Create the destination directory
      await fs.ensureDir(dest);
      
      // Process each entry
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        // Skip ignored directories
        const relativePath = path.relative(sourceDirAbs, srcPath);
        const shouldIgnore = ignoredDirs.some(dir => 
          relativePath === dir || 
          (relativePath && relativePath.startsWith(dir + path.sep))
        );
        
        if (shouldIgnore) {
          console.log(`  Skipping: ${relativePath}`);
          continue;
        }
        
        // Handle directories vs files
        if (entry.isDirectory()) {
          await copyDirRecursive(srcPath, destPath);
        } else {
          await fs.copy(srcPath, destPath);
        }
      }
    }
    
    // Start the copying process from source to app directory
    await copyDirRecursive(sourceDirAbs, appDir);
    console.log('Project files copied successfully');
    
    // Handle main file path if it's not already copied in the project structure
    const mainFilePath = path.join(sourceDirAbs, config.mainFile);
    const mainFileRelativePath = config.mainFile; // Keep relative path for launching
    
    // Create node_modules directory (it might already exist from the copy operation)
    await fs.ensureDir(path.join(appDir, 'node_modules'));
    
    // Copy qode.exe
    console.log('Copying qode executable...');
    await fs.copy(QODE_PATH, path.join(appDir, 'qode.exe'));
    
    // Copy NodeGUI modules - always needed
    console.log('Copying NodeGUI modules...');
    await fs.copy(
      path.join(NODE_MODULES, '@nodegui'),
      path.join(appDir, 'node_modules', '@nodegui')
    );
    
    // Read package.json to get dependencies
    let dependencies = [];
    try {
      const packageJsonPath = path.join(config.sourceDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = require(packageJsonPath);
        
        // Get all dependencies from package.json
        if (packageJson.dependencies) {
          dependencies = Object.keys(packageJson.dependencies);
          console.log(`Found ${dependencies.length} dependencies in package.json`);
        }
      } else {
        console.warn('No package.json found, using default dependencies');
      }
    } catch (error) {
      console.warn(`Error reading package.json: ${error.message}`);
    }
    
    // Add additional modules specified by user
    if (config.additionalModules && config.additionalModules.length > 0) {
      dependencies = [...new Set([...dependencies, ...config.additionalModules])];
    }
    
    // Filter out @nodegui modules as they're already copied
    dependencies = dependencies.filter(dep => !dep.startsWith('@nodegui/'));
    
    // Copy dependencies from node_modules
    if (dependencies.length > 0) {
      console.log('Copying dependencies:');
      for (const dep of dependencies) {
        const modulePath = path.join(NODE_MODULES, dep);
        if (fs.existsSync(modulePath)) {
          console.log(`  - ${dep}`);
          await fs.copy(
            modulePath,
            path.join(appDir, 'node_modules', dep)
          );
        } else {
          console.warn(`  - ${dep} (not found, skipping)`);
        }
      }
    } else {
      console.log('No dependencies to copy');
    }
    
    // Copy all Qt DLLs to root folder
    console.log('Copying Qt DLLs...');
    if (fs.existsSync(MINIQT_PATH)) {
      const qtVersions = fs.readdirSync(MINIQT_PATH);
      if (qtVersions.length > 0) {
        const qtVersion = qtVersions[0];
        const qtPath = path.join(MINIQT_PATH, qtVersion);
        const qtBinPath = path.join(qtPath, 'msvc2019_64', 'bin');
        
        // Copy all DLLs from bin folder
        const files = fs.readdirSync(qtBinPath);
        for (const file of files) {
          if (file.endsWith('.dll')) {
            await fs.copy(
              path.join(qtBinPath, file),
              path.join(appDir, file)
            );
          }
        }
        
        // Copy Qt plugins
        const pluginDirs = ['platforms', 'styles', 'imageformats'];
        for (const pluginDir of pluginDirs) {
          const srcDir = path.join(qtPath, 'msvc2019_64', 'plugins', pluginDir);
          if (fs.existsSync(srcDir)) {
            await fs.copy(srcDir, path.join(appDir, pluginDir));
          }
        }
        
        // Create qt.conf
        await fs.writeFile(
          path.join(appDir, 'qt.conf'),
          `[Paths]\nPlugins=./\nPrefixes=./\n`
        );
      }
    }
    
    // CREATE STARTUP SCRIPT
    console.log('Creating startup script...');
    await fs.writeFile(
      path.join(appDir, `debug.bat`),
      `@echo off
cd /d "%~dp0"
echo Starting ${config.appName}...

REM Set Qt environment variables
set PATH=%~dp0;%PATH%
set QT_PLUGIN_PATH=%~dp0
set QT_QPA_PLATFORM_PLUGIN_PATH=%~dp0\\platforms

REM Execute application with qode
"%~dp0qode.exe" "%~dp0${mainFileRelativePath.replace(/\//g, '\\')}"

REM Display error if any
if %errorlevel% neq 0 (
  echo Application exited with error code %errorlevel%
  pause
)
`
    );

    // Create PowerShell script to run hidden
    await fs.writeFile(
      path.join(appDir, 'run-hidden.ps1'),
      `$env:PATH = "$PSScriptRoot;$env:PATH"
$env:QT_PLUGIN_PATH = "$PSScriptRoot"
$env:QT_QPA_PLATFORM_PLUGIN_PATH = "$PSScriptRoot\\platforms"
Start-Process -FilePath "$PSScriptRoot\\qode.exe" -ArgumentList "$PSScriptRoot\\${mainFileRelativePath.replace(/\//g, '\\')}" -WindowStyle Hidden
`
    );

    // Create C# launcher
    console.log('Creating C# launcher...');
    await fs.writeFile(
      path.join(appDir, 'NodeGuiLauncher.cs'),
      `using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class NodeGuiLauncher
{
    static void Main()
    {
        try
        {
            // Get the directory of the executable
            string currentDir = AppDomain.CurrentDomain.BaseDirectory;
            
            // Path to qode and main.js
            string qodePath = Path.Combine(currentDir, "qode.exe");
            string mainJsPath = Path.Combine(currentDir, "${mainFileRelativePath.replace(/\//g, '\\\\')}");
            
            // Check if files exist
            if (!File.Exists(qodePath))
            {
                MessageBox.Show("Cannot find qode.exe", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            
            if (!File.Exists(mainJsPath))
            {
                MessageBox.Show("Cannot find ${mainFileRelativePath}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            
            // Setup process
            ProcessStartInfo startInfo = new ProcessStartInfo
            {
                FileName = qodePath,
                Arguments = mainJsPath,
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = currentDir
            };
            
            // Set environment for Qt
            startInfo.EnvironmentVariables["PATH"] = currentDir + ";" + Environment.GetEnvironmentVariable("PATH");
            startInfo.EnvironmentVariables["QT_PLUGIN_PATH"] = currentDir;
            startInfo.EnvironmentVariables["QT_QPA_PLATFORM_PLUGIN_PATH"] = Path.Combine(currentDir, "platforms");
            
            // Run qode
            Process proc = new Process { StartInfo = startInfo };
            proc.Start();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Error: " + ex.Message, "${config.appName} Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}`
    );

    // Compile C# launcher to EXE
    try {
      console.log('Compiling C# launcher to EXE...');
      
      // Create temporary bat file to compile
      const compilerScript = path.join(appDir, '_compile.bat');
      await fs.writeFile(compilerScript, 
        `@echo off
echo Compiling C# launcher...
set CSC=C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe
"%CSC%" /target:winexe /out:${config.appName}.exe /reference:System.Windows.Forms.dll NodeGuiLauncher.cs
if errorlevel 1 (
  echo Compilation failed!
  exit /b 1
)
echo Compilation successful!
del NodeGuiLauncher.cs
`);
      
      execSync(compilerScript, { cwd: appDir, stdio: 'inherit' });
      await fs.remove(compilerScript);
      
      console.log('EXE launcher created successfully!');
    } catch (error) {
      console.error('Failed to compile C# launcher:', error.message);
      console.log('You may need to compile it manually using csc.exe');
    }
    
    console.log(`Packaging complete! Your application is available at: ${appDir}`);
    return appDir;
    
  } catch (error) {
    console.error('Packaging failed:', error);
    console.error(error.stack);
    throw error;
  }
}

module.exports = { packageApp };
