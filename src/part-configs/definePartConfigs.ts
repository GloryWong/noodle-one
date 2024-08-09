import process from 'node:process'
import type { PackageJson, SetRequired } from 'type-fest'
import type { TemplateVariables } from '../types.js'
import { PART_TEMPLATE_LOCATION } from '../constants.js'

interface SrcItem {
  /**
   * Src item id
   */
  id: string
  /**
   * Glob patterns to include files
   */
  include?: string | string[]
  /**
   * Glob patterns to exclude files
   */
  exclude?: string | string[]
}

interface DefineConfigsItem {
  /**
   * Part template id, if its respective templates exists in the template repo's **parts**, it must be the folder name
   */
  id: string
  /**
   * Source files included. All files are included by default
   */
  srcItems?: SrcItem[]
  /**
   * Description for this config
   */
  description?: string
  /**
   * Suffix note appended after template is successfully applied
   */
  suffixNote?: string
  /**
   * The destination directory to which the part template will be copied.
   * Relative to process.cwd()
   * @default process.cwd()
   */
  destDir?: string
  /**
   * If set true, skip downloading and coping templates.
   * Useful if you only want to do some side-effect operations, e.g. `packageJsonUpdates`
   */
  skipTemplate?: boolean
  /**
   * Update properties of package.json file. Create a package.json file if not exists.
   */
  packageJsonUpdates?: PackageJson
  /**
   * The default variable values of templates
   */
  defaultVariables?: TemplateVariables | (() => TemplateVariables | Promise<TemplateVariables>)
}

type DefineConfigs = DefineConfigsItem[]

export interface PartConfig extends SetRequired<DefineConfigsItem, 'destDir'> {
  src: string
  defaultVariables?: TemplateVariables
}
export type PartConfigs = Map<string, PartConfig>

export async function definePartConfigs(configs: DefineConfigs) {
  const result: PartConfigs = new Map()
  for (let index = 0; index < configs.length; index++) {
    const config = configs[index]
    const item: Record<string, any> = { id: '', src: '', destDir: process.cwd() }
    const keys = Object.keys(config) as (keyof DefineConfigsItem)[]
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index]
      const value = config[key]
      item[key] = typeof value === 'function' ? await value() : value
    }
    item.src = `${PART_TEMPLATE_LOCATION}/${item.id}#master`
    result.set(item.id, item as PartConfig)
  }

  return result
}
