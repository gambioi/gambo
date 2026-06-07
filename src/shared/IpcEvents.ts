/*
 * Gambcord, a modification for Discord's desktop app
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
    INIT_FILE_WATCHERS = "GambcordInitFileWatchers",

    OPEN_QUICKCSS = "GambcordOpenQuickCss",
    GET_QUICK_CSS = "GambcordGetQuickCss",
    SET_QUICK_CSS = "GambcordSetQuickCss",
    QUICK_CSS_UPDATE = "GambcordQuickCssUpdate",

    GET_SETTINGS = "GambcordGetSettings",
    SET_SETTINGS = "GambcordSetSettings",

    GET_THEMES_LIST = "GambcordGetThemesList",
    GET_THEME_DATA = "GambcordGetThemeData",
    GET_THEME_SYSTEM_VALUES = "GambcordGetThemeSystemValues",
    THEME_UPDATE = "GambcordThemeUpdate",

    OPEN_EXTERNAL = "GambcordOpenExternal",
    OPEN_THEMES_FOLDER = "GambcordOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "GambcordOpenSettingsFolder",

    GET_UPDATES = "GambcordGetUpdates",
    GET_REPO = "GambcordGetRepo",
    UPDATE = "GambcordUpdate",
    BUILD = "GambcordBuild",

    OPEN_MONACO_EDITOR = "GambcordOpenMonacoEditor",
    GET_MONACO_THEME = "GambcordGetMonacoTheme",

    GET_PLUGIN_IPC_METHOD_MAP = "GambcordGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "GambcordCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "GambcordCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "GambcordCspRequestAddOverride",

    GET_RENDERER_CSS = "GambcordGetRendererCss",
    RENDERER_CSS_UPDATE = "GambcordRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "GambcordPreloadGetRendererJs",

    SUPPORTS_WINDOWS_MATERIAL = "GambcordSupportsWindowsMaterial",
}
