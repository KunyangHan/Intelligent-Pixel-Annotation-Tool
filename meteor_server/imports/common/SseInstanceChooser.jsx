import React from 'react';
import {Button, Dialog, IconButton} from '@material-ui/core';
import MDI, {ChevronRight, Eye, EyeOff} from 'mdi-material-ui';
import SseGlobals from './SseGlobals';
import SseToolbar from "./SseToolbar";
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

export default class SseInstanceChooser extends SseToolbar {

    constructor(props) {
        super();

        this.state = {
            activeInstanceIndex: 0
        };
    }

    getIcon(objDesc) {
        if (MDI[objDesc.icon]) {
            return MDI[objDesc.icon]();
        } else {
            return MDI.Label();
        }
    }

    messages() {
        this.onMsg("instanceSelection", (arg) => {
            this.setState({activeInstanceIndex: arg.instance.maskValue});
        });
    }

    displayAll() {
        if (this.state) {
            Object.keys(this.state).forEach(k => {
                if (k.toString().startsWith("mute") || k.toString().startsWith("solo")) {
                    delete this.state[k];
                }
            })
        }
    }

    shouldComponentUpdate(np, ns) {
        if (this.state.mode == "set-chooser" && ns.mode == "normal")
            this.sendMsg("dismiss-not-enough-classes");
        return true;
    }

    initSetChange() {
        this.setState({mode: "set-chooser"});
    }

    render() {
        const smallIconStyle = {width: "25px", height: "25px", color: "darkgray"};
        const smallIconSelected = {width: "25px", height: "25px", color: "red"};
        return (
            <div className="sse-instance-chooser vflex scroller"
                 style={{"backgroundColor": "#393536", "padding": "5px 5px 0 0"}}>
                {this.props.instanceList.insList.map((objDesc, idx) => {
                    const isSelected = objDesc.maskValue == this.state.activeInstanceIndex;
                    return <div className="hflex flex-align-items-center no-shrink" key={objDesc.label}>
                        <Button className="class-button"
                                onClick={() => {
                                    this.sendMsg('instanceSelection', {instance: objDesc});
                                }}
                                onMouseEnter={() => {
                                    this.sendMsg('instanceHighlight', {instance: objDesc});
                                }}
                                onMouseLeave={() => {
                                    this.sendMsg('instanceDeHighlight', {instance: objDesc});
                                }}
                                style={
                                    {

                                        "width": "100%",
                                        "minHeight": "40px",
                                        "margin": "1px",
                                        "backgroundColor": objDesc.colorStr,
                                        "color": SseGlobals.computeTextColor(objDesc.colorStr),
                                        "border": isSelected ? "solid 1px #E53935" : "solid 1px black",
                                        "padding": "0 3px"
                                    }}>
                            <div
                                className="hflex flex-align-items-center w100">
                                {objDesc.isForeground ? "F" : "B"}
                            </div>
                        </Button>
                    </div>
                })}
            </div>
        );
    }
}