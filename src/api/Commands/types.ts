/*
 * Gambcord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Command } from "@gambcord/discord-types";
export { ApplicationCommandInputType, ApplicationCommandOptionType, ApplicationCommandType } from "@gambcord/discord-types/enums";

export interface GambcordCommand extends Command {
    isGambcordCommand?: boolean;
}
