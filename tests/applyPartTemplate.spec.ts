import { join } from 'node:path'
import { ensureDir, exists, outputFile, readdir } from 'fs-extra'
import mockFs from 'mock-fs'
import { expect, vi } from 'vitest'
import { readPackage } from 'read-pkg'
import { applyPartTemplate } from '../src/applyPartTemplate.js'
import { getTmpPath } from '../src/utils/getTmpPath.js'
import { TEMPLATE_DOWNLOAD_DIR } from '../src/constants.js'
import { listDirFiles } from '../src/utils/listDirFiles.js'

const mocks = vi.hoisted(() => ({
  downloadTemplate: vi.fn()
    .mockImplementation(
      async (input: string, { dir }: { dir: string }) => {
        await ensureDir(dir)
        return ({ source: input, dir })
      },
    ),
}))

vi.mock('giget', () => ({
  downloadTemplate: mocks.downloadTemplate,
}))

afterEach(() => {
  mockFs.restore()
})

afterAll(() => {
  vi.doUnmock('giget')
})

describe('applyPartTemplate', () => {
  describe('basic copy template', () => {
    beforeEach(() => {
      mockFs({
        'file1.txt': 'file1',
        'file2.txt': 'file2',
        'dir': {
          'file1.txt': 'file1',
          'dir': {
            'file2.txt': 'file2',
          },
        },
      })
    })

    it('should throw error when passing partId is invalid', async () => {
      await expect(() => applyPartTemplate('test foo')).rejects.toThrowError(/invalid/i)
    })

    it('should throw error when the config of passing partId does not exist', async () => {
      await expect(() => applyPartTemplate('test')).rejects.toThrowError(/not exist/i)
    })

    it('should throw error when passing srcItemId is invalid', async () => {
      await expect(() => applyPartTemplate('partId1', 'foo bar')).rejects.toThrowError(/invalid/i)
    })

    it('should throw error when the srcItem of passing srcItemId does not exist', async () => {
      await expect(() => applyPartTemplate('partId1', 'foobar')).rejects.toThrowError(/not exist/i)
    })

    it('should throw error when fail to download', async () => {
      await expect(() => applyPartTemplate('partId1')).rejects.toThrowError(/Failed.*download/)
    })

    it('should copy from tmp to destination directory', async () => {
      mocks.downloadTemplate.mockImplementationOnce(async (input: string, { dir }: { dir: string }) => {
        await outputFile(join(dir, 'file3.txt'), '')
        await outputFile(join(dir, 'dir/file3.txt'), '')
        await outputFile(join(dir, 'dir/dir/file3.txt'), '')
        return ({ source: input, dir })
      })

      await applyPartTemplate('partId2')
      expect(await exists('.dir/file3.txt')).toBeTruthy()
      expect(await exists('.dir/dir/file3.txt')).toBeTruthy()
      expect(await exists('.dir/dir/dir/file3.txt')).toBeTruthy()
    })

    it('should skip downloading and coping when skipTemplate config is true', async () => {
      vi.doMock('../src/utils/deleteTmp.js', () => ({
        deleteTmp: vi.fn(),
      }))
      await applyPartTemplate('partId4')
      await expect(async () => readdir(await getTmpPath(TEMPLATE_DOWNLOAD_DIR, false))).rejects.toThrowError(/ENOENT/)
      vi.doUnmock('../src/utils/deleteTmp.js')
    })

    it('should clear the downloads in tmp, at the end of execution', async () => {
      mocks.downloadTemplate.mockImplementationOnce(async (input: string, { dir }: { dir: string }) => {
        await outputFile(join(dir, 'file3.txt'), '')
        return ({ source: input, dir })
      })

      await applyPartTemplate('partId1')

      expect((await readdir(await getTmpPath('downloads'))).length).toEqual(0)
    })

    it('should print the suffix note after successfully applying a template when suffixNote is configured', async () => {
      mocks.downloadTemplate.mockImplementationOnce(async (input: string, { dir }: { dir: string }) => {
        await outputFile(join(dir, 'file3.txt'), '')
        return ({ source: input, dir })
      })
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn())

      await applyPartTemplate('partId5')

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Note: suffix note test'))
      logSpy.mockRestore()
    })
  })

  describe('use glob patterns', () => {
    beforeEach(() => {
      mockFs()
      mocks.downloadTemplate.mockImplementationOnce(async (input: string, { dir }: { dir: string }) => {
        await outputFile(join(dir, 'file1'), '')
        await outputFile(join(dir, 'file2'), '')
        await outputFile(join(dir, 'dir/file1'), '')
        await outputFile(join(dir, 'dir/dir/file1'), '')
        return ({ source: input, dir })
      })
    })

    it('should include all files by default', async () => {
      await applyPartTemplate('partId6')
      expect(await exists('file1')).toBeTruthy()
      expect(await exists('file2')).toBeTruthy()
      expect(await exists('dir/file1')).toBeTruthy()
      expect(await exists('dir/dir/file1')).toBeTruthy()
    })

    it('should include files matching the include patterns', async () => {
      await applyPartTemplate('partId6', 'src-item1')
      expect(await listDirFiles('.')).toEqual([
        'dir/file1',
        'dir/dir/file1',
      ])
    })

    it('should exclude files matching the exclude patterns', async () => {
      await applyPartTemplate('partId6', 'src-item2')
      expect(await listDirFiles('.')).toEqual([
        'dir/file1',
      ])
    })
  })

  describe('package json update', () => {
    it('should create package.json when given in partConfigs', async () => {
      mockFs({
        'file1.txt': 'file1',
      })

      mocks.downloadTemplate.mockImplementationOnce(async (input: string, { dir }: { dir: string }) => {
        await outputFile(join(dir, 'file3.txt'), '')
        return ({ source: input, dir })
      })

      await applyPartTemplate('partId3')
      expect((await readPackage()).name).toBe('boo')
    })

    it('should update respective package json props when they are given in partConfigs', async () => {
      mockFs({
        'file1.txt': 'file1',
        'package.json': JSON.stringify({
          name: 'boo1',
          dependencies: {
            foo: '^4.3.1',
            foo2: '^1.0.0',
          },
        }),
      })

      mocks.downloadTemplate.mockImplementationOnce(async (input: string, { dir }: { dir: string }) => {
        await outputFile(join(dir, 'file3.txt'), '')
        return ({ source: input, dir })
      })

      await applyPartTemplate('partId3')
      const pkgJson = await readPackage()
      expect(pkgJson.name).toBe('boo')
      expect(pkgJson.dependencies?.foo).toBe('^4.3.2')
      expect(pkgJson.dependencies?.foo1).toBe('^5.1.1')
      expect(pkgJson.dependencies?.foo2).toBe('^1.0.0')
    })
  })
})
