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

  // Remove debug log
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
    let directDependencies = [];
    try {
      const packageJsonPath = path.join(config.sourceDir, 'package.json');
      console.log(`Reading package.json from: ${packageJsonPath}`);
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = require(packageJsonPath);
        
        // Get all dependencies from package.json
        if (packageJson.dependencies) {
          directDependencies = Object.keys(packageJson.dependencies);
          console.log(`Found ${directDependencies.length} direct dependencies in package.json`);
        }
      } else {
        console.warn('No package.json found, using default dependencies');
      }
    } catch (error) {
      console.warn(`Error reading package.json: ${error.message}`);
    }
    
    // Add additional modules specified by user
    if (config.additionalModules && config.additionalModules.length > 0) {
      directDependencies = [...new Set([...directDependencies, ...config.additionalModules])];
    }
    
    // Filter out @nodegui modules as they're already copied
    directDependencies = directDependencies.filter(dep => !dep.startsWith('@nodegui/'));
    
    // Set to track all dependencies to copy (direct and nested)
    const allDependencies = new Set(directDependencies);
    // Map to track dependencies that have been processed to avoid circular dependencies
    const processedDeps = new Map();
    
    // Recursive function to find all nested dependencies
    async function findNestedDependencies(moduleName) {
      // Skip if already processed
      if (processedDeps.has(moduleName)) {
        return;
      }
      
      processedDeps.set(moduleName, true);
      const modulePath = path.join(NODE_MODULES, moduleName);
      
      // Check for module's package.json
      const modulePackageJsonPath = path.join(modulePath, 'package.json');
      if (fs.existsSync(modulePackageJsonPath)) {
        try {
          const modulePackageJson = require(modulePackageJsonPath);
          
          // Get module dependencies
          if (modulePackageJson.dependencies) {
            const nestedDeps = Object.keys(modulePackageJson.dependencies);
            
            // Add all nested dependencies to the set
            for (const nestedDep of nestedDeps) {
              // Skip nodegui modules
              if (!nestedDep.startsWith('@nodegui/')) {
                allDependencies.add(nestedDep);
                // Recursively find this dependency's dependencies
                await findNestedDependencies(nestedDep);
              }
            }
          }
        } catch (error) {
          console.warn(`Error reading package.json for ${moduleName}: ${error.message}`);
        }
      }
    }
    
    // Find all nested dependencies
    console.log('Analyzing dependencies tree...');
    for (const dep of directDependencies) {
      await findNestedDependencies(dep);
    }
    
    // Copy all dependencies (direct and nested)
    if (allDependencies.size > 0) {
      console.log(`Copying ${allDependencies.size} total dependencies (including nested dependencies):`);
      for (const dep of allDependencies) {
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
echo Starting ${config.appName}...

qode.exe ${mainFileRelativePath.replace(/\//g, '\\')}
`
    );

    // Create a VBS script to run the batch file hidden
    console.log('Creating VBS hidden launcher...');
    await fs.writeFile(
      path.join(appDir, 'hidden-run.vbs'),
      `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & WScript.Arguments(0) & chr(34), 0
Set WshShell = Nothing
`
    );

    // Create a simple C launcher instead of C++
    console.log('Creating C launcher...');
    await fs.writeFile(
      path.join(appDir, 'NodeGuiLauncher.c'),
      `#include <windows.h>
#include <stdlib.h>

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    // Set Qt environment variables with relative paths
    SetEnvironmentVariable("QT_PLUGIN_PATH", ".");
    SetEnvironmentVariable("QT_QPA_PLATFORM_PLUGIN_PATH", "./platforms");
    
    // Run the VBS script which runs debug.bat hidden
    const char* cmd = "wscript.exe hidden-run.vbs debug.bat";
    
    // Execute the command
    WinExec(cmd, SW_HIDE);
    
    return 0;
}
`
    );

    // Update compilation script for C
    try {
      console.log('Compiling C launcher to EXE...');
      
      const compilerScript = path.join(appDir, '_compile.bat');
      await fs.writeFile(compilerScript, 
        `@echo off
echo Compiling C launcher...
gcc -o ${config.appName}.exe NodeGuiLauncher.c -mwindows
if %errorlevel% neq 0 (
  echo Compilation failed! Try installing MinGW.
  exit /b 1
)
del NodeGuiLauncher.c
echo Compilation successful!
`);

      execSync(compilerScript, { cwd: appDir, stdio: 'inherit' });
      await fs.remove(compilerScript);
      
      console.log('EXE launcher created successfully!');
    } catch (error) {
      console.error('Failed to compile C launcher:', error.message);
      console.log('You can compile it manually with: gcc -o app.exe NodeGuiLauncher.c -mwindows');
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
