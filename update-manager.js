import axios from 'axios';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

export class UpdateManager {
  // Static tracking for all plugins
  static registeredPlugins = new Map();
  static updateSummary = {
    totalChecked: 0,
    totalUpdated: 0,
    pluginsChecked: [],
    pluginsUpdated: [],
    lastCheck: null
  };
  
  // Centralized update settings
  static updateInterval = null;
  static isInitialized = false;
  static discordNotifier = null;
  static config = {
    enabled: true,
    checkInterval: 30 * 60 * 1000, // 30 minutes
    initialDelay: 15000, // 15 seconds
    batchDelay: 5000, // 5 seconds
    staggerDelay: 5 * 60 * 1000, // 5 minutes between plugin checks
    maxRetries: 3,
    retryDelay: 1000 // 1 second base delay
  };

  // Static method to register a plugin for centralized updates
  static registerPlugin(pluginName, currentVersion, owner, repo, pluginFilePath, logFunction = null) {
    const pluginInfo = {
      name: pluginName,
      version: currentVersion,
      owner,
      repo,
      filePath: pluginFilePath,
      log: logFunction || console.log,
      needsUpdate: false,
      latestVersion: null,
      lastChecked: null,
      lastUpdated: null,
      error: null
    };
    
    this.registeredPlugins.set(pluginName, pluginInfo);
    this.log(`📝 Registered plugin: ${pluginName} v${currentVersion}`);
    
    // Initialize if this is the first plugin
    if (!this.isInitialized) {
      this.initialize();
    }
    
    return pluginInfo;
  }
  
  // Static method to initialize the UpdateManager
  static initialize() {
    if (this.isInitialized) return;
    
    this.log('🚀 Initializing UpdateManager...');
    
    // Wait for SquadJS to fully initialize
    setTimeout(() => {
      this.performInitialUpdateCheck();
    }, this.config.initialDelay);
    
    // Set up periodic checks
    this.startPeriodicChecks();
    
    this.isInitialized = true;
    this.log('✅ UpdateManager initialized successfully');
  }
  
  // Static method to set Discord notifier
  static setDiscordNotifier(notifier) {
    this.discordNotifier = notifier;
    this.log('📱 Discord notifier configured');
  }
  
  // Static method to configure update settings
  static configure(settings) {
    this.config = { ...this.config, ...settings };
    this.log('⚙️ UpdateManager configuration updated');
  }
  
  // Static method to get update status
  static getUpdateStatus() {
    const plugins = Array.from(this.registeredPlugins.values());
    return {
      totalPlugins: plugins.length,
      lastCheck: this.updateSummary.lastCheck,
      updatesAvailable: plugins.filter(p => p.needsUpdate).length,
      plugins: plugins.map(p => ({
        name: p.name,
        currentVersion: p.version,
        latestVersion: p.latestVersion,
        needsUpdate: p.needsUpdate,
        lastChecked: p.lastChecked,
        error: p.error
      }))
    };
  }
  
  // Static method to perform initial update check for all plugins
  static async performInitialUpdateCheck() {
    this.log('🔄 Performing initial update check for all plugins...');
    await this.checkAllUpdates();
  }
  
  // Static method to start periodic update checks
  static startPeriodicChecks() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(() => {
      this.checkAllUpdates();
    }, this.config.checkInterval);
    
    this.log(`⏰ Periodic update checks scheduled every ${this.config.checkInterval / 60000} minutes`);
  }
  
  // Static method to check all registered plugins for updates
  static async checkAllUpdates() {
    if (!this.config.enabled || this.registeredPlugins.size === 0) {
      return;
    }
    
    this.log(`🔄 Checking updates for ${this.registeredPlugins.size} plugins...`);
    
    // Group plugins by repository to minimize API calls
    const repos = new Map();
    for (const [name, plugin] of this.registeredPlugins) {
      const repoKey = `${plugin.owner}/${plugin.repo}`;
      if (!repos.has(repoKey)) {
        repos.set(repoKey, []);
      }
      repos.get(repoKey).push(plugin);
    }
    
    // Check each repository
    let delay = 0;
    for (const [repoKey, plugins] of repos) {
      setTimeout(async () => {
        await this.checkRepositoryUpdates(repoKey, plugins);
      }, delay);
      delay += this.config.staggerDelay;
    }
    
    this.updateSummary.lastCheck = new Date();
  }
  
  // Static method to check updates for a specific repository
  static async checkRepositoryUpdates(repoKey, plugins) {
    try {
      const [owner, repo] = repoKey.split('/');
      const latestVersion = await this.getLatestVersion(owner, repo);
      
      if (!latestVersion) {
        this.log(`⚠️ Could not determine latest version for ${repoKey}`);
        return;
      }
      
      // Check each plugin from this repository
      for (const plugin of plugins) {
        await this.checkPluginUpdate(plugin, latestVersion);
      }
    } catch (error) {
      this.log(`❌ Error checking repository ${repoKey}: ${error.message}`);
    }
  }
  
  // Static method to check a specific plugin for updates
  static async checkPluginUpdate(plugin, latestVersion = null) {
    try {
      if (!latestVersion) {
        latestVersion = await this.getLatestVersion(plugin.owner, plugin.repo);
      }
      
      if (!latestVersion) {
        plugin.error = 'Could not determine latest version';
        plugin.lastChecked = new Date();
        return;
      }
      
      plugin.latestVersion = latestVersion;
      plugin.lastChecked = new Date();
      plugin.error = null;
      
      const comparison = this.compareVersions(plugin.version, latestVersion);
      
      if (comparison < 0) {
        // Update available
        plugin.needsUpdate = true;
        this.log(`🔄 Update available for ${plugin.name}: ${plugin.version} → ${latestVersion}`);
        
        // Perform the update
        const updateResult = await this.performPluginUpdate(plugin, latestVersion);
        
        if (updateResult.updated) {
          plugin.lastUpdated = new Date();
          plugin.version = latestVersion;
          plugin.needsUpdate = false;
          
          // Notify Discord if configured
          if (this.discordNotifier) {
            this.discordNotifier.onPluginUpdated(plugin.name, updateResult.oldVersion, latestVersion, updateResult.backupPath);
          }
          
          this.log(`✅ Successfully updated ${plugin.name} to ${latestVersion}`);
        } else {
          plugin.error = updateResult.error || 'Update failed';
          this.log(`❌ Failed to update ${plugin.name}: ${plugin.error}`);
        }
      } else if (comparison > 0) {
        this.log(`ℹ️ ${plugin.name} running newer version (${plugin.version}) than latest (${latestVersion})`);
      } else {
        this.log(`✅ ${plugin.name} is up to date (${plugin.version})`);
      }
      
      // Update summary
      this.addPluginChecked(plugin.name);
      
    } catch (error) {
      plugin.error = error.message;
      plugin.lastChecked = new Date();
      this.log(`❌ Error checking ${plugin.name}: ${error.message}`);
    }
  }
  
  // Static method to perform update for a specific plugin
  static async performPluginUpdate(plugin, latestVersion) {
    try {
      const updatedCodeUrl = `https://raw.githubusercontent.com/${plugin.owner}/${plugin.repo}/${latestVersion}/${this.getRelativePath(plugin.filePath)}`;
      
      // Download the updated code
      const response = await axios.get(updatedCodeUrl);
      const updatedCode = response.data;
      
      // Create backup
      const backupPath = await this.createBackup(plugin);
      
      // Write updated code
      fs.writeFileSync(plugin.filePath, updatedCode);
      
      // Verify the update
      const verifyCode = fs.readFileSync(plugin.filePath, 'utf8');
      if (verifyCode !== updatedCode) {
        throw new Error('File verification failed - update was not written correctly');
      }
      
      return {
        updated: true,
        newVersion: latestVersion,
        oldVersion: plugin.version,
        backupPath: backupPath
      };
      
    } catch (error) {
      this.log(`❌ Update failed for ${plugin.name}: ${error.message}`);
      return {
        updated: false,
        error: error.message
      };
    }
  }
  
  // Static method to create backup for a plugin
  static async createBackup(plugin) {
    try {
      const baseDir = process.cwd();
      const backupDir = path.join(baseDir, 'BACKUP-Plugins', plugin.name);
      
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const backupPath = path.join(backupDir, `${path.basename(plugin.filePath)}.backup`);
      const currentCode = fs.readFileSync(plugin.filePath, 'utf8');
      fs.writeFileSync(backupPath, currentCode);
      
      return backupPath;
    } catch (error) {
      this.log(`⚠️ Failed to create backup for ${plugin.name}: ${error.message}`);
      return null;
    }
  }
  
  // Static method to get relative path for GitHub URL
  static getRelativePath(filePath) {
    // Get the current working directory (should be the project root)
    const projectRoot = process.cwd();
    
    // Get the relative path from project root to the file
    const relativePath = path.relative(projectRoot, filePath);
    
    // Normalize path separators for GitHub URLs (use forward slashes)
    return relativePath.replace(/\\/g, '/');
  }
  
  // Static method to get latest version from GitHub
  static async getLatestVersion(owner, repo) {
    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      const response = await axios.get(url);
      
      if (response.data && response.data.tag_name) {
        return response.data.tag_name;
      }
      
      return null;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        this.log(`⚠️ Repository ${owner}/${repo} not found or has no releases`);
      } else {
        this.log(`❌ Error fetching latest version from GitHub: ${error.message}`);
      }
      return null;
    }
  }
  
  // Static method to compare versions
  static compareVersions(version1, version2) {
    if (!version1 || !version2) return 0;
    
    const v1Parts = version1.replace('v', '').split('.').map(Number);
    const v2Parts = version2.replace('v', '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1 = v1Parts[i] || 0;
      const v2 = v2Parts[i] || 0;
      
      if (v1 > v2) return 1;
      if (v1 < v2) return -1;
    }
    
    return 0;
  }
  
  // Static method to add plugin to checked list
  static addPluginChecked(pluginName) {
    if (!this.updateSummary.pluginsChecked.includes(pluginName)) {
      this.updateSummary.pluginsChecked.push(pluginName);
      this.updateSummary.totalChecked++;
    }
  }
  
  // Static method to add plugin to updated list
  static addPluginUpdated(pluginName, newVersion) {
    if (!this.updateSummary.pluginsUpdated.includes(pluginName)) {
      this.updateSummary.pluginsUpdated.push(pluginName);
      this.updateSummary.totalUpdated++;
    }
  }
  
  // Static method to reset update summary
  static resetUpdateSummary() {
    this.updateSummary = {
      totalChecked: 0,
      totalUpdated: 0,
      pluginsChecked: [],
      pluginsUpdated: [],
      lastCheck: null
    };
  }
  
  // Static method to print consolidated summary
  static printUpdateSummary() {
    const { totalChecked, totalUpdated, pluginsChecked, pluginsUpdated } = this.updateSummary;
    
    if (totalChecked === 0) return;
    
    this.log(`[UpdateManager] 🔄 Update cycle completed:`);
    this.log(`[UpdateManager] 📊 Checked ${totalChecked} plugin(s): ${pluginsChecked.join(', ')}`);
    
    if (totalUpdated > 0) {
      this.log(`[UpdateManager] 🚀 Updated ${totalUpdated} plugin(s): ${pluginsUpdated.join(', ')}`);
      this.log(`[UpdateManager] 🔄 Please restart SquadJS to apply updates`);
    } else {
      this.log(`[UpdateManager] ✅ All plugins are up to date`);
    }
    
    // Reset summary for next cycle
    this.resetUpdateSummary();
  }
  
  // Static method to log messages
  static log(message, ...args) {
    console.log(`[UpdateManager] ${message}`, ...args);
  }
  
  // Static method to manually check updates for a specific plugin
  static async checkPluginUpdates(pluginName) {
    const plugin = this.registeredPlugins.get(pluginName);
    if (!plugin) {
      this.log(`❌ Plugin ${pluginName} not found in registered plugins`);
      return;
    }
    
    await this.checkPluginUpdate(plugin);
  }
  
  // Static method to check all plugins manually
  static async checkAllPlugins() {
    this.log('🔄 Manually checking all plugins for updates...');
    await this.checkAllUpdates();
  }
  
  // Static method to get plugin information
  static getPluginInfo(pluginName) {
    return this.registeredPlugins.get(pluginName);
  }
  
  // Static method to get all registered plugins
  static getAllPlugins() {
    return Array.from(this.registeredPlugins.keys());
  }
  
  // Static method to disable updates for a specific plugin
  static disablePluginUpdates(pluginName) {
    const plugin = this.registeredPlugins.get(pluginName);
    if (plugin) {
      plugin.disabled = true;
      this.log(`🚫 Disabled updates for ${pluginName}`);
    }
  }
  
  // Static method to enable updates for a specific plugin
  static enablePluginUpdates(pluginName) {
    const plugin = this.registeredPlugins.get(pluginName);
    if (plugin) {
      plugin.disabled = false;
      this.log(`✅ Enabled updates for ${pluginName}`);
    }
  }
  
  // Static method to stop all update checks
  static stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isInitialized = false;
    this.log('🛑 UpdateManager stopped');
  }
  
  // Static method to restart update checks
  static restart() {
    this.stop();
    this.initialize();
  }
}

// Export both UpdateManager and AutoUpdater for backward compatibility
export { UpdateManager as AutoUpdater };
