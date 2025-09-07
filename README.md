# UpdateManager Utility

A centralized plugin update management system for SquadJS that automatically checks for and downloads plugin updates from GitHub repositories.

## 📦 Installation

Simply place the `update-manager.js` file in your `squad-server/utils/` directory. No additional dependencies required - it uses built-in Node.js modules and `axios`.

## ✨ Features

- **🔄 Automatic Updates**: Checks for plugin updates every 30 minutes (configurable)
- **📁 GitHub Integration**: Downloads updates directly from GitHub repositories
- **🛡️ Safe Updates**: Creates automatic backups before updating
- **📊 Batch Processing**: Groups plugins by repository to minimize API calls
- **⚡ Staggered Updates**: Prevents API rate limiting with 5-minute delays between repositories
- **🔍 Manual Control**: Admin commands for manual update checks
- **📱 Discord Integration**: Optional Discord notifications via UpdateManagerPlugin
- **🔄 Version Comparison**: Smart semantic version comparison
- **🛠️ Error Handling**: Graceful fallback on update failures

## 🚀 How It Works

### 1. Plugin Registration
Each plugin registers itself with the UpdateManager:

```javascript
import { UpdateManager } from '../utils/update-manager.js';
import { fileURLToPath } from 'url';

// In your plugin's constructor
UpdateManager.registerPlugin(
  'YourPluginName',           // Plugin identifier
  'v1.0.0',                  // Current version
  'YourGitHubUsername',       // GitHub owner
  'YourRepositoryName',       // GitHub repository
  fileURLToPath(import.meta.url), // Plugin file path
  (message, ...args) => this.verbose(1, message, ...args) // Logging function
);
```

### 2. Automatic Update Process
1. **Initial Check**: 15 seconds after SquadJS starts
2. **Periodic Checks**: Every 30 minutes (configurable)
3. **Repository Grouping**: Groups plugins by GitHub repository
4. **Version Comparison**: Compares current vs latest GitHub release
5. **Safe Download**: Downloads and verifies new code
6. **Backup Creation**: Creates backup in `BACKUP-Plugins/PluginName/`
7. **File Replacement**: Updates the plugin file
8. **Discord Notification**: Sends update notification (if configured)

### 3. GitHub Repository Structure
The UpdateManager expects your GitHub repository to have this structure:
```
YourRepository/
├── squad-server/
│   └── plugins/
│       └── YourPlugin.js  ← Plugin file here
├── README.md
└── other files...
```

## 🔧 Configuration

### Basic Setup
The UpdateManager can be configured globally to control how it operates. This configuration is typically done in your main SquadJS configuration or in the UpdateManagerPlugin itself.

```javascript
// Configure UpdateManager settings
UpdateManager.configure({
  enabled: true,                   // Enable/disable the entire update system
  checkInterval: 30 * 60 * 1000,  // How often to check for updates (30 minutes)
  initialDelay: 15000,            // Wait 15 seconds after startup before first check
  batchDelay: 5000,               // 5 second delay between plugin batches
  staggerDelay: 5 * 60 * 1000     // 5 minutes between different GitHub repositories
});
```

**Configuration Explained:**
- **`enabled`**: Master switch for the entire update system
- **`checkInterval`**: How often to automatically check for updates (in milliseconds)
- **`initialDelay`**: Prevents immediate update checks on startup, giving plugins time to register
- **`batchDelay`**: Small delay between processing multiple plugins from the same repository
- **`staggerDelay`**: Prevents GitHub API rate limiting by spacing out checks between different repositories

### Discord Integration
For Discord notifications, use the [UpdateManagerPlugin](https://github.com/Armyrat60/SquadJS-UpdateManagerPlugin.js):

```json
{
  "plugin": "UpdateManagerPlugin",
  "enabled": true,
  "discordClient": "discord",
  "channelID": "your-channel-id",
  "adminRoleID": "your-role-id",
  "enableUpdateNotifications": true,
  "updateCheckInterval": "30m"
}
```

## 📋 Admin Commands

**Where to use these commands:** These are **Discord chat commands** that you type in your Discord server where your SquadJS bot is running.

**How it works:**
1. Type the command in your Discord channel
2. The UpdateManagerPlugin receives the command
3. It calls the appropriate UpdateManager methods
4. Results are sent back as a Discord message

**Available Commands:**

- `!updatecheck` - Manually check all plugins for updates
- `!updatestatus` - Show current update status for all registered plugins
- `!updateplugins all` - Check updates for all plugins (same as !updatecheck)
- `!updateplugins PluginName` - Check updates for a specific plugin

**Example Usage:**
```
!updatecheck
!updatestatus
!updateplugins BM-OverlayMonitor
!updateplugins admin-camera-warnings
```

**Requirements:**
- UpdateManagerPlugin must be installed and configured
- You must have admin permissions in SquadJS
- Discord bot must be connected and monitoring the channel

## 🛠️ API Reference

### Core Methods

#### `UpdateManager.registerPlugin(name, version, owner, repo, filePath, logFunction)`
Register a plugin for automatic updates.

**Parameters:**
- `name` (string): Plugin identifier
- `version` (string): Current plugin version (e.g., "v1.0.0")
- `owner` (string): GitHub username/organization
- `repo` (string): GitHub repository name
- `filePath` (string): Full path to plugin file
- `logFunction` (function): Optional logging function

#### `UpdateManager.configure(settings)`
Configure UpdateManager settings.

**Settings:**
- `enabled` (boolean): Enable/disable updates
- `checkInterval` (number): Update check frequency in milliseconds
- `initialDelay` (number): Delay before first check in milliseconds
- `batchDelay` (number): Delay for batching multiple updates
- `staggerDelay` (number): Delay between repository checks

#### `UpdateManager.checkAllPlugins()`
Manually trigger update check for all registered plugins.

#### `UpdateManager.getUpdateStatus()`
Get current update status for all plugins.

#### `UpdateManager.getPluginInfo(pluginName)`
Get information about a specific plugin.

### Utility Methods

- `UpdateManager.stop()` - Stop all update checks
- `UpdateManager.restart()` - Restart update checks
- `UpdateManager.getAllPlugins()` - Get list of all registered plugins
- `UpdateManager.enablePluginUpdates(pluginName)` - Enable updates for specific plugin
- `UpdateManager.disablePluginUpdates(pluginName)` - Disable updates for specific plugin

## 📁 File Structure

```
squad-server/
├── utils/
│   └── update-manager.js          ← UpdateManager utility
├── plugins/
│   ├── UpdateManagerPlugin.js     ← Discord notifications
│   ├── YourPlugin.js              ← Your plugin
│   └── ...
└── BACKUP-Plugins/                ← Automatic backups
    ├── YourPlugin/
    │   └── YourPlugin.js.backup
    └── ...
```

## 🔗 Integration with UpdateManagerPlugin

The UpdateManager works seamlessly with the [UpdateManagerPlugin](https://github.com/Armyrat60/SquadJS-UpdateManagerPlugin.js) to provide:

- **Discord Notifications**: Real-time update alerts
- **Admin Commands**: Manual update control
- **Batch Notifications**: Consolidated update reports
- **Restart Reminders**: Periodic reminders to restart SquadJS
- **Status Monitoring**: Detailed update status information

## 🚨 Important Notes

1. **GitHub Releases**: Updates are downloaded from GitHub releases, not commits
2. **Version Tags**: Use semantic versioning (e.g., v1.0.0, v1.1.0)
3. **File Paths**: Ensure your GitHub repository structure matches your local structure
4. **Backups**: Always check the `BACKUP-Plugins/` directory for previous versions
5. **Restart Required**: Plugin updates require a SquadJS restart to take effect

## 🐛 Troubleshooting

### Common Issues

**Updates not working?**
- Check GitHub repository structure matches local structure
- Verify version tags exist in GitHub releases
- Check console logs for error messages

**File not found errors?**
- Ensure `fileURLToPath(import.meta.url)` is used for file paths
- Verify GitHub repository has the correct file structure

**Discord notifications not working?**
- Check UpdateManagerPlugin configuration
- Verify Discord channel and role IDs are correct

## 📄 License

This utility is part of the SquadJS ecosystem and follows the same licensing terms.

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue or submit a pull request!

---

**Need Discord notifications?** Check out the [UpdateManagerPlugin](https://github.com/Armyrat60/SquadJS-UpdateManagerPlugin.js) for complete Discord integration!
