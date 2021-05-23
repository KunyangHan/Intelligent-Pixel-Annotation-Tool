import React from 'react';
import {Button, Dialog, IconButton} from '@material-ui/core';
import MDI, {ChevronRight, Eye, EyeOff} from 'mdi-material-ui';
import SseGlobals from './SseGlobals';
import SseToolbar from "./SseToolbar";
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

export default class SseInsMaskChooser extends SseToolbar {

    constructor(props) {
        super();

        this.state = {
            activeMaskIndex: 0
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
        this.onMsg("insMaskSelection", (arg) => {
            this.setState({activeMaskIndex: arg.mask.idx});
        });
        this.onMsg("instanceSelection", (arg) => {
            this.setState({activeMaskIndex: arg.instance.activateMaskIdx});
        })
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
            <div className="sse-insMask-chooser vflex scroller"
                 style={{"padding": "5px 5px 0 0"}}>
                {this.props.instance.maskList.maskList.map((objDesc, idx) => {
                    const isSelected = objDesc.idx == this.state.activeMaskIndex;
                    // const buttonColor = "#F8F8FF";
                    const buttonColor = "#3F3795";
                    return <div className="hflex flex-align-items-center no-shrink" key={objDesc.label}
                                style={{"height" : "45px"}}>
                        <Button className="class-button"
                                onClick={() => {
                                    this.sendMsg('insMaskSelection', {mask: objDesc});
                                }}
                                style={
                                    {
                                        "width": "100%",
                                        "minHeight": "40px",
                                        "margin": "1px",
                                        "backgroundColor": buttonColor,
                                        "color": SseGlobals.computeTextColor(buttonColor),
                                        "border": isSelected ? "solid 1px #ffffff" : "solid 1px black",
                                        "padding": "0 3px"
                                    }}>
                            <div
                                className="hflex flex-align-items-center w100">
                                {objDesc.name}
                            </div>
                        </Button>
                    </div>
                })}
                {this.props.instance.className.match(/Person|Human/gi) != null
                    ? <Button 
                        onClick={() => this.sendMsg('humanParsing', {maskIdx : this.state.activeMaskIndex})}
                        disabled={this.props.instance.maskValue == 0}>
                            Human Parsing
                    </Button>
                    : null}
                <Button 
                    onClick={() => this.sendMsg('newInsMask', {maskIdx : this.state.activeMaskIndex})}
                    disabled={this.props.instance.maskValue == 0}>
                        Edit from This
                </Button>
            </div>
        );
    }
}