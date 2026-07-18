import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSshGitProviderMock, gitExecFileAsyncMock, sshExecMock } = vi.hoisted(() => ({
  getSshGitProviderMock: vi.fn(),
  gitExecFileAsyncMock: vi.fn(),
  sshExecMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  gitExecFileAsync: gitExecFileAsyncMock
}))

vi.mock('../providers/ssh-git-dispatch', () => ({
  getSshGitProvider: getSshGitProviderMock
}))

import {
  _resetGiteeRepoRefCache,
  getGiteeRepoRef,
  getGiteeRepoRefForRemote,
  isGiteeHost,
  parseGiteeRepoRef
} from './repository-ref'

describe('Gitee repository refs', () => {
  beforeEach(() => {
    getSshGitProviderMock.mockReset()
    gitExecFileAsyncMock.mockReset()
    sshExecMock.mockReset()
    _resetGiteeRepoRefCache()
  })

  it('recognizes only gitee.com and its subdomains', () => {
    expect(isGiteeHost('gitee.com')).toBe(true)
    expect(isGiteeHost('Git.Gitee.com')).toBe(true)
    expect(isGiteeHost('notgitee.com')).toBe(false)
    expect(isGiteeHost('gitea.com')).toBe(false)
  })

  it('parses scp-like Gitee remotes', () => {
    expect(parseGiteeRepoRef('git@gitee.com:team/project.git')).toEqual({
      host: 'gitee.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://gitee.com/api/v5',
      webBaseUrl: 'https://gitee.com'
    })
  })

  it('parses HTTPS Gitee remotes', () => {
    expect(parseGiteeRepoRef('https://gitee.com/team/project.git/')).toEqual({
      host: 'gitee.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://gitee.com/api/v5',
      webBaseUrl: 'https://gitee.com'
    })
  })

  it('upgrades the API origin for HTTP Gitee remotes to HTTPS', () => {
    expect(parseGiteeRepoRef('http://gitee.com/team/project.git')).toEqual({
      host: 'gitee.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://gitee.com/api/v5',
      webBaseUrl: 'http://gitee.com'
    })
  })

  it('parses ssh:// remotes without carrying the SSH port into API URLs', () => {
    expect(parseGiteeRepoRef('ssh://git@code.gitee.com:2222/team/project.git')).toEqual({
      host: 'code.gitee.com',
      owner: 'team',
      repo: 'project',
      apiBaseUrl: 'https://code.gitee.com/api/v5',
      webBaseUrl: 'https://code.gitee.com'
    })
  })

  it('rejects remotes owned by other forge providers', () => {
    expect(parseGiteeRepoRef('git@github.com:team/project.git')).toBeNull()
    expect(parseGiteeRepoRef('https://gitlab.com/team/project.git')).toBeNull()
    expect(parseGiteeRepoRef('https://gitea.example.test/team/project.git')).toBeNull()
  })

  it('reads and caches the local origin remote', async () => {
    gitExecFileAsyncMock.mockResolvedValue({
      stdout: 'https://gitee.com/team/project.git\n',
      stderr: ''
    })

    await expect(getGiteeRepoRef('/repo')).resolves.toMatchObject({
      owner: 'team',
      repo: 'project'
    })
    await expect(getGiteeRepoRef('/repo')).resolves.toMatchObject({
      owner: 'team',
      repo: 'project'
    })

    expect(gitExecFileAsyncMock).toHaveBeenCalledOnce()
    expect(gitExecFileAsyncMock).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], {
      cwd: '/repo'
    })
  })

  it('uses the SSH git provider for connected repositories', async () => {
    sshExecMock.mockResolvedValue({
      stdout: 'git@gitee.com:remote/project.git\n',
      stderr: ''
    })
    getSshGitProviderMock.mockReturnValue({ exec: sshExecMock })

    await expect(
      getGiteeRepoRefForRemote('/remote/repo', 'upstream', 'ssh-1')
    ).resolves.toMatchObject({
      owner: 'remote',
      repo: 'project'
    })
    expect(sshExecMock).toHaveBeenCalledWith(['remote', 'get-url', 'upstream'], '/remote/repo')
    expect(gitExecFileAsyncMock).not.toHaveBeenCalled()
  })
})
