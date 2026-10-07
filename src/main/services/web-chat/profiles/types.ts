import type { WebChatTargetId } from '@shared/types'

export interface WebChatProfile {
  id: WebChatTargetId
  label: string
  url: string
  inputSelectors: string[]
  sendSelectors: string[]
  responseSelectors: string[]
  stopSelectors: string[]
  copySelectors: string[]
  fileSelectors?: string[]

  /**
   * Generates in-page JS snippet to inject the prompt text into the editor.
   * Receives the variable name of the prompt string in scope (e.g. 'prompt').
   */
  getInjectPromptScript: (promptVarName: string) => string

  /**
   * Generates in-page JS snippet to submit the prompt.
   */
  getSubmitScript: () => string

  /**
   * Generates in-page JS snippet returning boolean indicating if generation is in progress.
   */
  getIsGeneratingScript: () => string

  /**
   * Generates in-page JS snippet returning clickable element if paused/waiting for continuation, or null.
   */
  getIsPausedScript: () => string

  /**
   * Generates in-page JS snippet returning boolean indicating busy/thinking indicator.
   */
  getIsBusyScript: () => string

  /**
   * Generates in-page JS snippet returning clean response or pruning provider-specific UI elements.
   * Operates on cloned DOM node in variable 'clone'.
   */
  getCleanResponseScript: () => string
}
