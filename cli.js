#!/usr/bin/env node

const { packageApp } = require('./index');
const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');

program
  .name('nodegui-builder')
  .description('Tool for packaging NodeGUI applications into standalone executables')
  .version('1.0.0');

program
  .option('-n, --name <name>', 'application name', 'NodeGUIApp')
  .option('-s, --source <path>', 'source directory', process.cwd())
  .option('-o, --output <path>', 'output directory', path.join(process.cwd(), 'deploy'))
  .option('-m, --main <filename>', 'main file', 'main.js')
  .option('-a, --add-module <module...>', 'additional npm modules to include')
  .action(async (options) => {
    try {
      console.log(chalk.blue('NodeGUI Builder - Packaging tool'));
      console.log(chalk.cyan('Configuration:'));
      console.log(chalk.cyan(`  App Name: ${options.name}`));
      console.log(chalk.cyan(`  Source Directory: ${options.source}`));
      console.log(chalk.cyan(`  Output Directory: ${options.output}`));
      console.log(chalk.cyan(`  Main File: ${options.main}`));
      
      if (options.addModule && options.addModule.length > 0) {
        console.log(chalk.cyan('  Additional Modules:'));
        options.addModule.forEach(mod => console.log(chalk.cyan(`    - ${mod}`)));
      }
      
      const appDir = await packageApp({
        appName: options.name,
        sourceDir: options.source,
        outputDir: options.output,
        mainFile: options.main,
        additionalModules: options.addModule || []
      });
      
      console.log(chalk.green(`\n✓ Application successfully packaged to:`));
      console.log(chalk.green(`  ${appDir}`));
    } catch (error) {
      console.error(chalk.red('Error during packaging:'));
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  });

program.parse();
