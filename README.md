# NodeGUI Builder

Tool for packaging NodeGUI applications into standalone desktop applications for Windows.

## Installation

```
npm install -g nodegui-builder
```

Or install locally in your project:

```
npm install --save-dev nodegui-builder
```

## Usage

### Preparing your package.json

You can also add a packaging script to simplify the build process:

```json
{
  "scripts": {
    "package": "nodegui-builder --name MyApp --source ./my-project --output ./dist --main app.js",
    // ...other scripts
  }
}
```

### In JavaScript code

```javascript
const { packageApp } = require('nodegui-builder');

packageApp({
  appName: 'MyApp',
  sourceDir: './my-project',
  outputDir: './dist',
  mainFile: 'main.js',
  additionalModules: ['moment', 'lodash']
}).then(appDir => {
  console.log(`Application packaged to: ${appDir}`);
}).catch(err => {
  console.error('Packaging failed:', err);
});
```

## Options

| Option | Description | Default |
|----------|-------|----------|
| `--name, -n` | Application name | `NodeGUIApp` |
| `--source, -s` | Application source directory | Current directory |
| `--output, -o` | Output directory | `./deploy` |
| `--main, -m` | Main application file | `main.js` |
| `--add-module, -a` | Additional npm modules to package | `[]` |

## Results

After packaging, the application will include:

1. An executable `.exe` file to launch the application
2. A `.bat` batch file to launch from command line
3. All necessary libraries and dependencies

## Requirements

- Windows
- Node.js 14+
- NodeGUI application with all dependencies installed

## License

MIT
