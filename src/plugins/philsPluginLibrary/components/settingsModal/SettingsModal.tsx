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

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { ContributorAuthorSummary } from "@plugins/philsPluginLibrary/components/ContributorAuthorSummary";
import { Author, Contributor } from "@plugins/philsPluginLibrary/types";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot } from "@utils/modal";
import React, { JSX } from "react";

import { ensurePhilModernStyle } from "../../styles/modern";


export interface SettingsModalProps extends React.ComponentProps<typeof ModalRoot> {
    title?: string;
    subtitle?: string;
    onClose: () => void;
    onDone?: () => void;
    footerContent?: JSX.Element;
    closeButtonName?: string;
    author?: Author,
    contributors?: Contributor[];
}

export const SettingsModal = (props: SettingsModalProps) => {
    ensurePhilModernStyle();

    const doneButton =
        <Button
            className="phil-apply"
            size="small"
            variant="primary"
            onClick={props.onDone}
        >
            {props.closeButtonName ?? "Done"}
        </Button>;

    return (
        <ModalRoot {...props}>
            <ModalHeader separator={false}>
                <div className="phil-head">
                    <div className="phil-head-ic">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
                            <path d="M4 18V6h2v12H4Zm4 0V9h2v9H8Zm4 0v-6h2v6h-2Zm4 0V4h2v14h-2Z" />
                        </svg>
                    </div>
                    <div className="phil-head-text">
                        {props.title && <div className="phil-head-title">{props.title}</div>}
                        <div className="phil-head-sub">{props.subtitle ?? "Gambo · advanced controls"}</div>
                    </div>
                    <div style={{ marginLeft: "auto" }}>
                        <ModalCloseButton onClick={props.onClose} />
                    </div>
                </div>
            </ModalHeader>
            <ModalContent style={{ marginBottom: "1em", display: "flex", flexDirection: "column", gap: "1em" }}>
                {props.children}
            </ModalContent>
            <ModalFooter>
                <Flex style={{ width: "100%" }}>
                    <div style={{ flex: 1, display: "flex" }}>
                        {(props.author || props.contributors && props.contributors.length > 0) &&

                            <Flex style={{ justifyContent: "flex-start", alignItems: "center", flex: 1 }}>
                                <ContributorAuthorSummary
                                    author={props.author}
                                    contributors={props.contributors} />
                            </Flex>
                        }
                        {props.footerContent}
                    </div>
                    <div style={{ marginLeft: "auto" }}>{doneButton}</div>
                </Flex>
            </ModalFooter>
        </ModalRoot >
    );
};
