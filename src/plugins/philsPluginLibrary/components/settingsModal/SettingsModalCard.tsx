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

import { Card } from "@components/Card";
import { Switch } from "@components/Switch";
import React from "react";

import { ensurePhilModernStyle } from "../../styles/modern";

export interface SettingsModalItemProps extends Pick<React.ComponentProps<"div">,
    | "children"> {
    title?: string;
    switchEnabled?: boolean;
    switchProps?: React.ComponentProps<typeof Switch>;
    flex?: number;
    cardProps?: React.ComponentProps<typeof Card>;
}

export const SettingsModalCard = ({ children, title, switchProps, switchEnabled, flex, cardProps }: SettingsModalItemProps) => {
    ensurePhilModernStyle();

    return (
        <Card
            {...cardProps}
            className={`phil-card ${cardProps?.className ?? ""}`}
            style={{
                flex: flex ?? 1,
                ...(cardProps?.style ? cardProps.style : {})
            }}>
            {(title || switchEnabled) && (
                <div className="phil-card-top">
                    {title && <div className="phil-card-title">{title}</div>}
                    {switchEnabled &&
                        <Switch
                            className="phil-card-switch"
                            checked={false}
                            onChange={() => void 0}
                            disabled={false}
                            {...switchProps}
                        />
                    }
                </div>
            )}
            {children && <div className="phil-card-ctl">{children}</div>}
        </Card>
    );
};
