/**
 * ViewRouter — thin React component that delegates to `renderView()`.
 *
 * Kept as a tiny component (not a hook) so the JSX call site in `MainArea`
 * stays declarative.
 */

import React from 'react'
import { renderView, type ChatRouteContext } from './routes'
import type { ViewKey } from '../types'

interface Props {
  view: ViewKey
  chatContext: ChatRouteContext
}

export const ViewRouter: React.FC<Props> = ({ view, chatContext }) => {
  return <>{renderView({ view, chatContext })}</>
}
