/*
 * Gambo, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
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
import { Flex } from "@components/Flex";
import { Switch } from "@components/Switch";
import { HeadsetProfile, HeadsetStore } from "@plugins/betterHeadset.desktop/stores";
import {
    ProfilableStore,
    SettingsModal,
    SettingsModalCard,
    SettingsModalCardItem,
    SettingsModalCardRow,
    SettingsModalProfilesCard
} from "@plugins/philsPluginLibrary";
import { Styles } from "@plugins/philsPluginLibrary/styles";
import { ModalSize } from "@utils/modal";
import { SelectOption } from "@gambo/discord-types";
import { Forms, Select, Slider, useState } from "@webpack/common";

const simpleOutputVolumes: readonly SelectOption[] = [
    { label: "Normal (100%)", value: 100 },
    { label: "Boost (200%)", value: 200 },
    { label: "High (500%)", value: 500 },
    { label: "Max (1000%)", value: 1000 },
] as const;

export interface HeadsetSettingsModalProps extends React.ComponentProps<typeof SettingsModal> {
    headsetStore: ProfilableStore<HeadsetStore, HeadsetProfile>;
    showInfo?: boolean;
}

export const HeadsetSettingsModal = (props: HeadsetSettingsModalProps) => {
    const { headsetStore, showInfo } = props;

    const {
        currentProfile,
        simpleMode,
        setSimpleMode,

        setOutputVolume,
        setOutputVolumeEnabled,
        setAttenuateWhileSpeaking,
        setAttenuateWhileSpeakingEnabled,
        setAttenuationFactor,
        setQos,
        setQosEnabled,
        setJitterBuffer,
        setJitterBufferEnabled,
    } = headsetStore.use();

    const {
        outputVolume,
        outputVolumeEnabled,
        attenuateWhileSpeaking,
        attenuateWhileSpeakingEnabled,
        attenuationFactor,
        qos,
        qosEnabled,
        jitterBuffer,
        jitterBufferEnabled,
    } = currentProfile;

    const [isSaving, setIsSaving] = useState(false);

    const simpleToggle =
        <Flex style={{ justifyContent: "center", alignItems: "center", gap: "0.6em" }}>
            <Forms.FormTitle style={{ margin: 0 }} tag="h5">Simple</Forms.FormTitle>
            <Switch checked={simpleMode ?? false} disabled={isSaving} onChange={checked => setSimpleMode(checked)} />
        </Flex>;

    // ─── Output Volume ────────────────────────────────────────────────────────
    const cardOutputVolumeSimple =
        <SettingsModalCard title="Output Volume" switchEnabled flex={0.6}
            switchProps={{ checked: outputVolumeEnabled ?? false, disabled: isSaving, onChange: status => setOutputVolumeEnabled(status) }}>
            <SettingsModalCardItem>
                <Select
                    isDisabled={!outputVolumeEnabled || isSaving}
                    options={simpleOutputVolumes}
                    select={(value: number) => setOutputVolume(value)}
                    isSelected={(value: number) => value === outputVolume}
                    serialize={() => ""} />
            </SettingsModalCardItem>
        </SettingsModalCard>;

    const cardOutputVolume =
        <SettingsModalCard title="Output Volume" switchEnabled flex={0.5}
            switchProps={{ checked: outputVolumeEnabled ?? false, disabled: isSaving, onChange: status => setOutputVolumeEnabled(status) }}>
            <SettingsModalCardItem title="%">
                <div style={{ paddingTop: "0.3em", paddingRight: "0.4em", paddingLeft: "0.4em", boxSizing: "border-box" }}>
                    <Slider
                        disabled={!outputVolumeEnabled || isSaving}
                        onValueChange={value => setOutputVolume(value)}
                        initialValue={outputVolume ?? 100}
                        minValue={0} maxValue={1000}
                        markers={[0, 100, 200, 500, 1000]}
                        onValueRender={value => `${value.toFixed(0)}%`} />
                </div>
            </SettingsModalCardItem>
        </SettingsModalCard>;

    // ─── Duck while speaking ──────────────────────────────────────────────────
    const cardAttenuationSimple =
        <SettingsModalCard title="Duck while speaking" flex={0.4} switchEnabled
            switchProps={{
                checked: (attenuateWhileSpeakingEnabled && attenuateWhileSpeaking) ?? false,
                disabled: isSaving,
                onChange: status => { setAttenuateWhileSpeakingEnabled(status); setAttenuateWhileSpeaking(status); }
            }}>
        </SettingsModalCard>;

    const cardAttenuation =
        <SettingsModalCard title="Duck while speaking" switchEnabled flex={0.5}
            switchProps={{ checked: attenuateWhileSpeakingEnabled ?? false, disabled: isSaving, onChange: status => { setAttenuateWhileSpeakingEnabled(status); setAttenuateWhileSpeaking(status); } }}>
            <SettingsModalCardItem title="Amount %">
                <div style={{ paddingTop: "0.3em", paddingRight: "0.4em", paddingLeft: "0.4em", boxSizing: "border-box" }}>
                    <Slider
                        disabled={!attenuateWhileSpeakingEnabled || isSaving}
                        onValueChange={value => setAttenuationFactor(value)}
                        initialValue={attenuationFactor ?? 50}
                        minValue={0} maxValue={100}
                        markers={[0, 25, 50, 75, 100]}
                        onValueRender={value => `${value.toFixed(0)}%`} />
                </div>
            </SettingsModalCardItem>
        </SettingsModalCard>;

    // ─── Network / output quality ─────────────────────────────────────────────
    const cardQos =
        <SettingsModalCard title="QoS" switchEnabled flex={0.35}
            switchProps={{
                checked: qosEnabled ?? false,
                disabled: isSaving,
                onChange: status => setQosEnabled(status)
            }}>
            <SettingsModalCardItem title="Enabled">
                <Switch
                    checked={qos ?? true}
                    disabled={!qosEnabled || isSaving}
                    onChange={val => setQos(val)} />
            </SettingsModalCardItem>
            <SettingsModalCardItem>
                <Forms.FormText style={{ opacity: 0.6, fontSize: "0.75em" }}>
                    Prioritise audio packets
                </Forms.FormText>
            </SettingsModalCardItem>
        </SettingsModalCard>;

    const cardJitterBuffer =
        <SettingsModalCard title="Jitter Buffer" switchEnabled flex={0.65}
            switchProps={{
                checked: jitterBufferEnabled ?? false,
                disabled: isSaving,
                onChange: status => setJitterBufferEnabled(status)
            }}>
            <SettingsModalCardItem title="Level">
                <div style={{ paddingTop: "0.3em", paddingRight: "0.4em", paddingLeft: "0.4em", boxSizing: "border-box" }}>
                    <Slider
                        disabled={!jitterBufferEnabled || isSaving}
                        onValueChange={value => setJitterBuffer(Math.round(value))}
                        initialValue={jitterBuffer ?? 2}
                        minValue={0} maxValue={4}
                        markers={[0, 1, 2, 3, 4]}
                        onValueRender={value => {
                            const labels = ["Min (low latency)", "1", "2 (default)", "3", "Max (stable)"];
                            return labels[Math.round(value)] ?? `${Math.round(value)}`;
                        }} />
                </div>
            </SettingsModalCardItem>
        </SettingsModalCard>;

    const cardProfiles =
        <SettingsModalProfilesCard
            flex={0.6}
            onSaveStateChanged={state => setIsSaving(state)}
            profileableStore={headsetStore} />;

    const infoCard =
        <Card style={{ ...Styles.infoCard }}>
            <Forms.FormTitle tag="h5">Headset — output quality</Forms.FormTitle>
            <Forms.FormText>
                <span style={{ fontWeight: "bold" }}>Output Volume</span> boosts your headset past 100%. &nbsp;
                <span style={{ fontWeight: "bold" }}>Duck while speaking</span> lowers other users/apps while you talk. &nbsp;
                <span style={{ fontWeight: "bold" }}>QoS ON</span> → audio packets prioritised. &nbsp;
                <span style={{ fontWeight: "bold" }}>Jitter Buffer low</span> → less latency (stable connection).
            </Forms.FormText>
        </Card>;

    return (
        <SettingsModal
            size={ModalSize.DYNAMIC}
            title="Headset Settings"
            subtitle="Output volume, ducking & audio reception"
            closeButtonName="Apply"
            footerContent={
                <Flex style={{ justifyContent: "center", alignItems: "center", marginLeft: "auto" }}>
                    {simpleToggle}
                </Flex>
            }
            {...props}
            onDone={() => {
                props.onClose();
                props.onDone && props.onDone();
            }}
        >
            {simpleMode
                ? <div style={{ width: "42em", display: "flex", flexDirection: "column", gap: "1em" }}>
                    <SettingsModalCardRow>
                        {cardOutputVolumeSimple}
                        {cardAttenuationSimple}
                    </SettingsModalCardRow>
                    {showInfo && <SettingsModalCardRow>{infoCard}</SettingsModalCardRow>}
                </div>
                : <div style={{ display: "flex", flexDirection: "column", width: "52em", gap: "1em" }}>
                    <SettingsModalCardRow>
                        {cardOutputVolume}
                        {cardAttenuation}
                    </SettingsModalCardRow>
                    <SettingsModalCardRow>
                        {cardQos}
                        {cardJitterBuffer}
                    </SettingsModalCardRow>
                    <SettingsModalCardRow>
                        {cardProfiles}
                    </SettingsModalCardRow>
                    {showInfo && <SettingsModalCardRow>{infoCard}</SettingsModalCardRow>}
                </div>
            }
        </SettingsModal>
    );
};
