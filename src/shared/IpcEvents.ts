/*
 * Gambo, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export const enum IpcEvents {
    INIT_FILE_WATCHERS = "GamboInitFileWatchers",

    OPEN_QUICKCSS = "GamboOpenQuickCss",
    GET_QUICK_CSS = "GamboGetQuickCss",
    SET_QUICK_CSS = "GamboSetQuickCss",
    QUICK_CSS_UPDATE = "GamboQuickCssUpdate",

    GET_SETTINGS = "GamboGetSettings",
    SET_SETTINGS = "GamboSetSettings",

    GET_THEMES_LIST = "GamboGetThemesList",
    GET_THEME_DATA = "GamboGetThemeData",
    GET_THEME_SYSTEM_VALUES = "GamboGetThemeSystemValues",
    THEME_UPDATE = "GamboThemeUpdate",

    OPEN_EXTERNAL = "GamboOpenExternal",
    OPEN_THEMES_FOLDER = "GamboOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "GamboOpenSettingsFolder",

    GET_UPDATES = "GamboGetUpdates",
    GET_REPO = "GamboGetRepo",
    UPDATE = "GamboUpdate",
    BUILD = "GamboBuild",

    DISCORD_GET_INFO = "GamboDiscordGetInfo",
    DISCORD_LIST_VERSIONS = "GamboDiscordListVersions",
    DISCORD_DOWNLOAD = "GamboDiscordDownload",
    DISCORD_RUN_INSTALLER = "GamboDiscordRunInstaller",
    DISCORD_OPEN_DOWNLOADS = "GamboDiscordOpenDownloads",

    OPEN_MONACO_EDITOR = "GamboOpenMonacoEditor",
    GET_MONACO_THEME = "GamboGetMonacoTheme",

    GET_PLUGIN_IPC_METHOD_MAP = "GamboGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "GamboCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "GamboCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "GamboCspRequestAddOverride",

    GET_RENDERER_CSS = "GamboGetRendererCss",
    RENDERER_CSS_UPDATE = "GamboRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "GamboPreloadGetRendererJs",

    SUPPORTS_WINDOWS_MATERIAL = "GamboSupportsWindowsMaterial",
}
