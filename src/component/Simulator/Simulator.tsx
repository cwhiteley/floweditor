import * as React from 'react';
import * as axios from 'axios';
import { react as bindCallbacks } from 'auto-bind';
import update from 'immutability-helper';
import { v4 as generateUUID } from 'uuid';
import { FlowDefinition, Group } from '../../flowTypes';
import ActivityManager, { Activity } from '../../services/ActivityManager';
import { FlowDetails, getFlow } from '../../external';
import LogEvent, { EventProps } from './LogEvent';
import { endpointsPT, ConfigProviderContext } from '../../config';

import * as styles from './Simulator.scss';
import { ReactNode } from 'react';

const ACTIVE = 'A';

interface Message {
    text: string;
    inbound: boolean;
}

export interface SimulatorProps {
    definition: FlowDefinition;
    Activity: any;
    showDefinition?: (definition: FlowDefinition) => void;
}

interface SimulatorState {
    visible: boolean;
    session?: Session;
    contact: Contact;
    channel: string;
    events: EventProps[];
    active: boolean;
}

interface Contact {
    uuid: string;
    urns: string[];
    fields: {};
    groups: Group[];
}

interface Step {
    arrived_on: Date;
    events: EventProps[];
    node: string;
    exit_uuid: string;
    node_uuid: string;
}

interface Wait {
    timeout: number;
    type: string;
}

interface Run {
    path: Step[];
    flow_uuid: string;
    status: string;
    wait?: Wait;
}

interface RunContext {
    contact: Contact;
    session: Session;
    events: EventProps[];
}

interface Session {
    runs: Run[];
    events: EventProps[];
    input?: any;
}

/**
 * Our dev console for simulating or testing expressions
 */
export default class Simulator extends React.Component<SimulatorProps, SimulatorState> {
    private debug: Session[] = [];
    private flows: FlowDefinition[] = [];
    private currentFlow: string;
    private inputBox: HTMLInputElement;

    // marks the bottom of our chat
    private bottom: any;

    public static contextTypes = {
        endpoints: endpointsPT
    };

    constructor(props: SimulatorProps, context: ConfigProviderContext) {
        super(props);
        this.state = {
            active: false,
            visible: false,
            events: [],
            contact: {
                uuid: generateUUID(),
                urns: ['tel:+12065551212'],
                fields: {},
                groups: []
            },
            channel: generateUUID()
        };
        this.bottomRef = this.bottomRef.bind(this);
        this.inputBoxRef = this.inputBoxRef.bind(this);
        this.currentFlow = this.props.definition.uuid;

        bindCallbacks(this, {
            include: [/^on/]
        });
    }

    private bottomRef(ref: any): void {
        return (this.bottom = ref);
    }

    private inputBoxRef(ref: any): void {
        this.inputBox = ref;
    }

    private updateActivity(): void {
        if (this.state.session) {
            let lastExit: string = null;
            const paths: { [key: string]: number } = {};
            const active: { [nodeUUID: string]: number } = {};
            let activeFlow: string;

            for (const run of this.state.session.runs) {
                let finalStep: Step = null;

                for (const step of run.path) {
                    if (lastExit) {
                        const key = lastExit + ':' + step.node_uuid;
                        let pathCount = paths[key];
                        if (!pathCount) {
                            pathCount = 0;
                        }
                        paths[key] = ++pathCount;
                    }
                    lastExit = step.exit_uuid;
                    finalStep = step;
                }

                if (run.status === ACTIVE && finalStep) {
                    let count = active[finalStep.node_uuid];
                    if (!count) {
                        count = 0;
                    }
                    active[finalStep.node_uuid] = ++count;
                    activeFlow = run.flow_uuid;
                }
            }

            const activity: Activity = { segments: paths, nodes: active };

            // console.log(JSON.stringify(activity, null, 1));
            this.props.Activity.setSimulation(activity);

            if (activeFlow && activeFlow !== this.currentFlow) {
                const flow = this.flows.find((other: FlowDefinition) => {
                    return other.uuid === activeFlow;
                });
                if (flow) {
                    this.props.showDefinition(flow);
                }
                this.currentFlow = activeFlow;
            } else if (!activeFlow) {
                this.props.showDefinition(null);
            }
        }
    }

    private updateRunContext(body: any, runContext: RunContext): void {
        const events = update(this.state.events, { $push: runContext.events }) as EventProps[];

        let activeRuns = false;
        for (const run of runContext.session.runs) {
            if (run.status === 'A') {
                activeRuns = true;
                break;
            }
        }

        if (!activeRuns) {
            events.push({
                type: 'info',
                text: 'Exited flow'
            });
        }

        this.setState(
            {
                session: runContext.session,
                contact: runContext.contact,
                events,
                active: activeRuns
            },
            () => {
                this.updateActivity();
                this.inputBox.focus();
            }
        );
    }

    private startFlow() {
        // reset our events and contact
        this.setState(
            {
                events: [],
                contact: {
                    uuid: generateUUID(),
                    urns: ['tel:+12065551212'],
                    fields: {},
                    groups: []
                }
            },
            () => {
                getFlow(this.context.endpoints.flows, this.props.definition.uuid, true).then(
                    (details: FlowDetails) => {
                        this.flows = [this.props.definition].concat(details.dependencies);
                        const body: any = {
                            flows: this.flows,
                            contact: this.state.contact
                        };

                        axios.default
                            .post(
                                `${this.context.endpoints.engine}/flow/start`,
                                JSON.stringify(body, null, 2)
                            )
                            .then((response: axios.AxiosResponse) => {
                                this.updateRunContext(body, response.data as RunContext);
                            });
                    }
                );
            }
        );
    }

    private resume(text: string): void {
        if (text === '\\debug') {
            console.log(JSON.stringify(this.debug, null, 2));
            return;
        }

        if (text === '\\recalc') {
            console.log('recal..');
            // this.props.plumberRepaint();
            return;
        }

        getFlow(this.context.endpoints.flows, this.props.definition.uuid, true).then(
            (details: FlowDetails) => {
                this.flows = [this.props.definition].concat(details.dependencies);
                const body: any = {
                    flows: this.flows,
                    session: this.state.session,
                    contact: this.state.contact,
                    event: {
                        type: 'msg_received',
                        text,
                        urn: this.state.contact.urns[0],
                        channel_uuid: this.state.channel,
                        contact_uuid: this.state.contact.uuid,
                        created_on: new Date()
                    }
                };

                axios.default
                    .post(
                        `${this.context.endpoints.engine}/flow/resume`,
                        JSON.stringify(body, null, 2)
                    )
                    .then((response: axios.AxiosResponse) => {
                        this.updateRunContext(body, response.data as RunContext);
                    })
                    .catch(error => {
                        const events = update(this.state.events, {
                            $push: [
                                {
                                    type: 'error',
                                    text: error.response.data.error
                                }
                            ]
                        }) as EventProps[];
                        this.setState({ events });
                    });
            }
        );
    }

    private onReset(event: any): void {
        this.startFlow();
    }

    public componentDidUpdate(prevProps: SimulatorProps): void {
        if (this.bottom) {
            this.bottom.scrollIntoView(false);
        }
    }

    private onKeyUp(event: any): void {
        if (event.key === 'Enter') {
            const ele = event.target;
            const text = ele.value;
            ele.value = '';
            this.resume(text);
        }
    }

    private onToggle(event: any): void {
        const newVisible = !this.state.visible;
        this.setState({ visible: newVisible }, () => {
            // clear our viewing definition
            if (!this.state.visible) {
                this.props.showDefinition(null);
                window.setTimeout(() => {
                    this.props.Activity.clearSimulation();
                }, 500);
            } else {
                this.updateActivity();

                // start our flow if we haven't already
                if (this.state.events.length === 0) {
                    this.startFlow();
                }

                this.inputBox.focus();
            }
        });
    }

    public render(): ReactNode {
        const messages: JSX.Element[] = [];
        for (const event of this.state.events) {
            messages.push(<LogEvent {...event} key={String(event.created_on)} />);
        }

        const simHidden = !this.state.visible ? styles.sim_hidden : '';
        const tabHidden = this.state.visible ? styles.tab_hidden : '';

        return (
            <div>
                <div>
                    <div className={styles.simulator + ' ' + simHidden} key={'sim'}>
                        <a
                            className={
                                styles.reset +
                                ' ' +
                                (this.state.active ? styles.active : styles.inactive)
                            }
                            onClick={this.onReset}
                        />
                        <div className={styles.icon_simulator + ' icon-simulator'} />
                        <div
                            className={styles.icon_close + ' icon-remove'}
                            onClick={this.onToggle}
                        />
                        <div className={styles.screen}>
                            <div className={styles.messages}>
                                {messages}
                                <div
                                    id="bottom"
                                    style={{ float: 'left', clear: 'both' }}
                                    ref={this.bottomRef}
                                />
                            </div>
                            <div className={styles.controls}>
                                <input
                                    ref={this.inputBoxRef}
                                    type="text"
                                    onKeyUp={this.onKeyUp}
                                    disabled={!this.state.active}
                                    placeholder={
                                        this.state.active
                                            ? 'Enter message'
                                            : 'Press home to start again'
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <div className={styles.simulator_tab + ' ' + tabHidden} onClick={this.onToggle}>
                    <div className={styles.simulator_tab_icon + ' icon-simulator'} />
                    <div className={styles.simulator_tab_text}>
                        Run in<br />Simulator
                    </div>
                </div>
            </div>
        );
    }
}
