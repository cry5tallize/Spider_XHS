import { useParams } from 'react-router';
import { ParseWorkspace } from './Workspace';
export function Component() {
  const { id = '' } = useParams();
  return <ParseWorkspace initialJobID={id} />;
}
