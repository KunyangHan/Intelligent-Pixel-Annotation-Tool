import React from 'react';
import {Button, Checkbox, Dialog, IconButton} from '@material-ui/core';
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

        this.onMsg("instanceNewSelection", ({instance}) => {
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
                 style={{"padding": "5px 5px 0 0"}}>
                {this.props.instanceList.insList.map((objDesc, idx) => {
                    const isSelected = objDesc.maskValue == this.state.activeInstanceIndex;
                    // const buttonColor = objDesc.color;
                    const buttonColor = "#3F3795";
                    return <div className="hflex flex-align-items-center no-shrink" key={objDesc.label}
                            style={{"height" : "45px"}}>
                        <Checkbox
                            checked={objDesc.isForeground == true}
                            disabled={objDesc.isForeground == 255}
                            color={"#3F3795"}
                            onChange={(event) => {
                                this.sendMsg("instanceCheckbox", {
                                    isF : event.target.checked,
                                    ins : objDesc.maskValue}); 
                            }}
                            style={
                                {
                                    "width": "30%",
                                    "height" : "40px",
                                    "margin": "1px",
                                    "padding": "0 3px"
                            }}
                        />
                        <Button className="class-button"
                                onClick={(e) => {
                                    this.sendMsg('instanceSelection', {instance: objDesc});
                                }}
                                onDoubleClick={(event) => {
                                    // event.preventDefault();
                                    // console.log("right click ?");
                                    this.sendMsg('instanceSelection', {instance: objDesc});
                                    this.sendMsg('changeInsClass', {instance: objDesc});
                                }}
                                onMouseEnter={() => {
                                    if (typeof objDesc.isForeground == "boolean"){
                                        this.sendMsg('instanceHighlight', {instance: objDesc});
                                    }
                                }}
                                onMouseLeave={() => {
                                    if (typeof objDesc.isForeground == "boolean"){
                                        this.sendMsg('instanceDeHighlight', {instance: objDesc});
                                    }
                                }}
                                style={
                                    {
                                        "width": "70%",
                                        "minHeight": "40px",
                                        "margin": "1px",
                                        "backgroundColor": buttonColor,
                                        "color": SseGlobals.computeTextColor(buttonColor),
                                        "border": isSelected ? "solid 1px #ffffff" : "solid 1px black",
                                        "padding": "0 3px"
                                    }}>
                            <div
                                className="hflex flex-align-items-center w100">
                                {objDesc.className}
                            </div>
                        </Button>
                    </div>
                })}
                <Button onClick={() => this.sendMsg("NewInstance")}>New Instance</Button>
            </div>
        );
    }
}