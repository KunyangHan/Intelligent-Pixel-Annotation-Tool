import React from 'react';
import {Button, Dialog, IconButton} from '@material-ui/core';
import MDI, {ChevronRight, Eye, EyeOff} from 'mdi-material-ui';
import SseGlobals from './SseGlobals';
import SseToolbar from "./SseToolbar";
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';

export default class SseRecommendChooser extends SseToolbar {

    constructor(props) {
        super();

        this.state = {
            activeRecommendIndex: 0
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
        this.onMsg("recommendSelection", (arg) => {
            this.setState({activeRecommendIndex: arg.recommend.idx});
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
            <div className="sse-recommend-chooser vflex scroller"
                 style={{"backgroundColor": "#393536", "padding": "5px 5px 0 0"}}>
                {this.props.instanceReady 
                    ? (this.props.recommendList.rcmList.map((objDesc, idx) => {
                        const isSelected = objDesc.idx == this.state.activeRecommendIndex;
                        return <div className="hflex flex-align-items-center no-shrink" key={objDesc.label}>
                            <Button className="class-button"
                                onClick={() => {
                                    this.sendMsg('recommendSelection', {recommend: objDesc});
                                }}
                                style={
                                    {
                                        "width": "100%",
                                        "minHeight": "40px",
                                        "margin": "1px",
                                        "backgroundColor": "#F8F8FF",
                                        "color": SseGlobals.computeTextColor("#F8F8FF"),
                                        "border": isSelected ? "solid 3px #ffe100" : "solid 1px black",
                                        "padding": "0 3px"
                                    }}>
                                <div
                                    className="hflex flex-align-items-center w100">
                                    {objDesc.mode}
                                </div>
                            </Button>
                        </div>
                    }))
                    : null}
                {this.props.instanceReady 
                    ? <Button onClick={() => this.sendMsg('editRecommend', {rcmIdx : this.state.activeRecommendIndex})}>Edit</Button>
                    : <Button 
                        onClick={() => this.sendMsg('instanceReady')}
                        style={
                            {
                                "width": "100%",
                                "minHeight": "40px",
                                "margin": "1px",
                                "border": "solid 1px #e8fffd",
                                "padding": "0 3px",
                                "top": "40%"
                            }}>
                        Remove Background</Button>}
            </div>
        );
    }
}