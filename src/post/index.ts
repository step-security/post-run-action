/**
 * The entrypoint for the post action.
 */

import * as core from '@actions/core'
import * as fs from 'node:fs'
import { env } from 'process'
import * as crypto from 'crypto'
import * as path from 'path'
import * as io from '@actions/io'
import * as exec from '@actions/exec'
import axios, { isAxiosError } from 'axios'

async function validateSubscription() {
  const eventPath = env.GITHUB_EVENT_PATH
  let repoPrivate
  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'srz-zumix/post-run-action'
  const action = env.GITHUB_ACTION_REPOSITORY
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions'

  core.info('')
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m')
  core.info(`Secure drop-in replacement for ${upstream}`)
  if (repoPrivate === false)
    core.info('\u001b[32m\u2713 Free for public repositories\u001b[0m')
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`)
  core.info('')

  if (repoPrivate === false) return

  const serverUrl = env.GITHUB_SERVER_URL || 'https://github.com'
  const body: Record<string, string> = { action: action || '' }
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl
  const repository = env.GITHUB_REPOSITORY ?? ''

  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${repository}/actions/maintained-actions-subscription`,
      body,
      { timeout: 3000 }
    )
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      )
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      )
      process.exit(1)
    }
    core.info('Timeout or API not reachable. Continuing to next step.')
  }
}

async function resolveShell(): Promise<string[]> {
  const defaultCommands: { [key: string]: string[] } = {
    default: ['bash', '-e', '{0}'],
    sh: ['sh', '-e', '{0}'],
    bash: ['bash', '--noprofile', '--norc', '-eo', 'pipefail', '{0}'],
    cmd: ['cmd', '/D', '/E:ON', '/V:OFF', '/S', '/C', '"CALL "{0}""'],
    pwsh: ['pwsh', '-command', ". '{0}'"],
    powershell: ['powershell', '-command', ". '{0}'"],
    dotnet: ['dotnet', 'run', '-c', 'Release', '{0}']
  }
  const shellCommand = core.getInput('shell', { required: false })
  if (!shellCommand) {
    return defaultCommands['default']
  }

  const shellCommands = shellCommand.split(' ')
  if (shellCommands.length === 1) {
    if (shellCommands[0] in defaultCommands) {
      return defaultCommands[shellCommands[0]]
    } else {
      return [shellCommands[0], '{0}']
    }
  }
  return shellCommands
}

function resolveExtension(command: string): string {
  const commandExtensions: { [key: string]: string } = {
    python: 'py',
    cmd: 'cmd',
    pwsh: 'ps1',
    powershell: 'ps1',
    dotnet: 'cs'
  }
  if (command in commandExtensions) {
    return commandExtensions[command]
  }
  return 'sh'
}

async function run(): Promise<void> {
  try {
    await validateSubscription()

    if (env.GITHUB_EVENT_NAME === 'pull_request_target') {
      core.warning(
        'post-run-action is running in a pull_request_target context. Make sure the post-run script does not contain unvalidated github.event.* data (PR title/body/branch name, comment author, etc.) — those values are attacker-controlled and would be executed verbatim. See README "Security Considerations".'
      )
    }

    const content: string = core.getInput('post-run', { required: true })
    const shellCommands: string[] = await resolveShell()
    const command = shellCommands[0]
    const commandPath: string = await io.which(command, true)

    const runnerTempPath: string = process.env.RUNNER_TEMP as string
    const extension: string = resolveExtension(command)
    const uniqueId = crypto.randomUUID()
    const scriptFileName = `post-run-action-${uniqueId}.${extension}`
    const scriptPath = path.join(runnerTempPath, scriptFileName)
    // mode 0o600 restricts the temp script to owner read/write only — defense-in-depth
    // against other processes on the runner reading templated secrets in the script.
    await fs.promises.writeFile(scriptPath, content, { mode: 0o600 })

    const commandArgs = shellCommands
      .slice(1)
      .map((item) => item.replace('{0}', scriptPath))

    const options: exec.ExecOptions = {}
    options.windowsVerbatimArguments = command === 'cmd'

    await exec.exec(`"${commandPath}"`, commandArgs, options)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

void run()
