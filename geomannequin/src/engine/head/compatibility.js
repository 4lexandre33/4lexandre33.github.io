import {ringV2} from "./sections.js";
import {pointV2,buildHeadV2} from "./cranial-surface.js";
import {earPointV2,buildEarV2} from "./ears.js";
import {jawPoseV2} from "./jaw-rig.js";
export const headV2Enabled=p=>p&&p.headModel==="v2";
export const compatibleRingV2=ringV2;
export const compatibleHeadPointV2=pointV2;
export const compatibleEarPointV2=earPointV2;
export {buildHeadV2,buildEarV2,jawPoseV2};
