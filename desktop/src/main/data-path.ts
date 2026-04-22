import { dirname, join } from 'node:path'

import { app } from 'electron'

export function getProjectDataPath(...parts: string[]) {
  return join(dirname(app.getPath('exe')), 'data', ...parts)
}
