import ManagementWorkspace from './management-workspace';
import {misRequirementsConfigured} from '../../lib/hft/planning/mis-profile';
import {misPresentationAdmitted} from '../../lib/hft/ui-reuse/workspace-profile';
export const dynamic='force-dynamic';
export default function MISPage(){return <ManagementWorkspace presentationOnly={misPresentationAdmitted(process.env)} requirementsOnly={misRequirementsConfigured(process.env)}/>;}
