import ManagementWorkspace from './management-workspace';
import {misRequirementsConfigured} from '../../lib/hft/planning/mis-profile';
export const dynamic='force-dynamic';
export default function MISPage(){return <ManagementWorkspace requirementsOnly={misRequirementsConfigured(process.env)}/>;}
