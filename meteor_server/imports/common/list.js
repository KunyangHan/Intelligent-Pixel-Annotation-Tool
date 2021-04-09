import {Meteor} from "meteor/meteor";
import { Session } from 'meteor/session';


export default function imageList() {
    // list = null;
    Meteor.call('read-list', (err, res) => {
        Session.set('result', res);
    });

    // let list = Meteor.apply('read-list', [], { returnStubValue: true });
    let list = Session.get('result');


    console.log("get image list", list);

    return list;
};