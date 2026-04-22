import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

import { app } from 'electron'
import {
  buildFallbackArchive,
  standardizeComment,
  standardizeNote,
  standardizeSearchNotes,
  standardizeSearchUsers,
  standardizeUser,
} from './data-standardizer'
import { getProjectDataPath } from './data-path'

type CookieMap = Record<string, string>

type RequestResult<T> = {
  success: boolean
  msg: string
  data: T | null
  rawText: string
  resJson: Record<string, unknown> | null
}

const cjsRequire = createRequire(import.meta.url)
;(globalThis as { __desktopRequire?: NodeRequire }).__desktopRequire = cjsRequire

function ensureCommonJsAsset(fileName: string) {
  const sourcePath = join(app.getAppPath(), 'src', 'static', fileName)
  const cacheDir = getProjectDataPath('static-cache')
  const targetPath = join(cacheDir, fileName.replace(/\.js$/, '.cjs'))
  const sourceText = readFileSync(sourcePath, 'utf-8')
  const patchedText = sourceText.replace(
    'var CryptoJs = require("crypto-js");',
    'var CryptoJs = globalThis.__desktopRequire("crypto-js");',
  )

  if (!existsSync(targetPath) || readFileSync(targetPath, 'utf-8') !== patchedText) {
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(targetPath, patchedText, 'utf-8')
  }

  if (fileName === 'xhs_xray.js') {
    const pack1Source = join(app.getAppPath(), 'src', 'static', 'xhs_xray_pack1.js')
    const pack2Source = join(app.getAppPath(), 'src', 'static', 'xhs_xray_pack2.js')
    const pack1Target = join(cacheDir, 'xhs_xray_pack1.js')
    const pack2Target = join(cacheDir, 'xhs_xray_pack2.js')

    if (!existsSync(pack1Target) || readFileSync(pack1Target, 'utf-8') !== readFileSync(pack1Source, 'utf-8')) {
      writeFileSync(pack1Target, readFileSync(pack1Source, 'utf-8'), 'utf-8')
    }

    if (!existsSync(pack2Target) || readFileSync(pack2Target, 'utf-8') !== readFileSync(pack2Source, 'utf-8')) {
      writeFileSync(pack2Target, readFileSync(pack2Source, 'utf-8'), 'utf-8')
    }
  }

  return targetPath
}

const signer = cjsRequire(ensureCommonJsAsset('xhs_main_260411.js'))
cjsRequire(ensureCommonJsAsset('xhs_xray.js'))

const BASE_URL = 'https://edith.xiaohongshu.com'

function transCookies(cookiesStr: string): CookieMap {
  if (!cookiesStr) {
    return {}
  }

  const parts = cookiesStr.includes('; ') ? cookiesStr.split('; ') : cookiesStr.split(';')
  return parts.reduce<CookieMap>((acc, item) => {
    const index = item.indexOf('=')
    if (index <= 0) {
      return acc
    }

    const key = item.slice(0, index).trim()
    const value = item.slice(index + 1)
    if (key) {
      acc[key] = value
    }
    return acc
  }, {})
}

function spliceStr(api: string, params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    search.append(key, value === null || value === undefined ? '' : String(value))
  })
  return `${api}?${search.toString()}`
}

function getCommonHeaders() {
  return {
    authority: 'www.xiaohongshu.com',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'cache-control': 'no-cache',
    origin: 'https://www.xiaohongshu.com',
    pragma: 'no-cache',
    referer: 'https://www.xiaohongshu.com/',
    'sec-ch-ua': '"Not A(Brand";v="99", "Microsoft Edge";v="121", "Chromium";v="121"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
    'x-mns': 'unload',
  }
}

function generateXrayTraceId() {
  const traceId = (globalThis as { traceId?: () => string }).traceId
  return typeof traceId === 'function' ? traceId() : createFallbackId('xray')
}

function buildRequestHeaders(cookiesStr: string, api: string, data: unknown = '', method: 'GET' | 'POST' = 'POST') {
  const cookies = transCookies(cookiesStr)
  const a1 = cookies.a1
  if (!a1) {
    throw new Error('Cookie 中缺少 a1')
  }

  const signature = signer.get_request_headers_params(api, data, a1, method)
  const cookieHeader = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
  const headers = {
    ...getCommonHeaders(),
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8',
    cookie: cookieHeader,
    'x-s': signature.xs,
    'x-t': String(signature.xt),
    'x-s-common': signature.xs_common,
    'x-b3-traceid': Array.from({ length: 16 }, () => 'abcdef0123456789'[Math.floor(Math.random() * 16)]).join(''),
    'x-xray-traceid': generateXrayTraceId(),
  }

  return { headers, cookies, body: typeof data === 'string' ? data : JSON.stringify(data) }
}

async function requestJson<T>(url: string, init: RequestInit): Promise<RequestResult<T>> {
  const response = await fetch(url, init)
  const rawText = await response.text()

  let resJson: Record<string, unknown> | null = null
  try {
    resJson = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null
  } catch {
    resJson = null
  }

  const success = response.ok && Boolean(resJson?.success ?? true)
  const msg = typeof resJson?.msg === 'string' ? resJson.msg : response.ok ? 'success' : `HTTP ${response.status}`

  return {
    success,
    msg,
    data: (resJson?.data ?? null) as T | null,
    rawText,
    resJson,
  }
}

function parseUrlParams(url: string) {
  const parsed = new URL(url)
  const params: Record<string, string> = {}
  parsed.searchParams.forEach((value, key) => {
    params[key] = value
  })
  return { parsed, params }
}

function createFallbackId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function createHexId(length: number) {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
}

function getStringParam(params: Record<string, string>, key: string, fallback = '') {
  return params[key] ?? fallback
}

function extractLastPathSegment(url: string) {
  return url.split('?')[0].split('/').filter(Boolean).pop() ?? ''
}

async function fetchText(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  }
}

export class XhsPcApi {
  async getHomefeedAllChannel(cookiesStr: string, proxies?: string) {
    const api = '/api/sns/web/v1/homefeed/category'
    const { headers } = buildRequestHeaders(cookiesStr, api, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + api, {
      method: 'GET',
      headers,
    })
  }

  async getHomefeedRecommend(category: string, cursorScore: string, refreshType: number, noteIndex: number, cookiesStr: string) {
    const api = '/api/sns/web/v1/homefeed'
    const data = {
      cursor_score: cursorScore,
      num: 20,
      refresh_type: refreshType,
      note_index: noteIndex,
      unread_begin_note_id: '',
      unread_end_note_id: '',
      unread_note_count: 0,
      category,
      search_key: '',
      need_num: 10,
      image_formats: ['jpg', 'webp', 'avif'],
      need_filter_image: false,
    }
    const { headers, body } = buildRequestHeaders(cookiesStr, api, data, 'POST')
    return requestJson<Record<string, unknown>>(BASE_URL + api, {
      method: 'POST',
      headers,
      body,
    })
  }

  async getHomefeedRecommendByNum(category: string, requireNum: number, cookiesStr: string) {
    const noteList: unknown[] = []
    let cursorScore = ''
    let refreshType = 1
    let noteIndex = 0
    const pageResponses: RequestResult<Record<string, unknown>>[] = []

    while (noteList.length < requireNum) {
      const result = await this.getHomefeedRecommend(category, cursorScore, refreshType, noteIndex, cookiesStr)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { noteList, pageResponses },
        }
      }

      const items = (result.data as Record<string, unknown>).items as unknown[] | undefined
      if (!items || items.length === 0) {
        break
      }

      noteList.push(...items)
      const nextCursor = (result.data as Record<string, unknown>).cursor_score as string | undefined
      if (!nextCursor) {
        break
      }

      cursorScore = nextCursor
      refreshType = 3
      noteIndex += 20
      if (items.length < 20) {
        break
      }
    }

    return {
      success: true,
      msg: 'success',
      data: {
        noteList: noteList.slice(0, requireNum),
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async getUserInfo(userId: string, cookiesStr: string) {
    const api = '/api/sns/web/v1/user/otherinfo'
    const spliceApi = spliceStr(api, { target_user_id: userId })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async getUserNoteInfo(userId: string, cursor: string, cookiesStr: string, xsecToken = '', xsecSource = '') {
    const api = '/api/sns/web/v1/user_posted'
    const spliceApi = spliceStr(api, {
      num: '30',
      cursor,
      user_id: userId,
      image_formats: 'jpg,webp,avif',
      xsec_token: xsecToken,
      xsec_source: xsecSource,
    })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async getUserAllNotes(userUrl: string, cookiesStr: string) {
    const { parsed, params } = parseUrlParams(userUrl)
    const userId = parsed.pathname.split('/').filter(Boolean).pop() ?? ''
    const xsecToken = params.xsec_token ?? ''
    const xsecSource = params.xsec_source ?? 'pc_search'
    const noteList: unknown[] = []
    const pageResponses: RequestResult<Record<string, unknown>>[] = []
    let cursor = ''

    while (true) {
      const result = await this.getUserNoteInfo(userId, cursor, cookiesStr, xsecToken, xsecSource)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { noteList, pageResponses },
        }
      }

      const notes = (result.data as Record<string, unknown>).notes as unknown[] | undefined
      if (!notes || notes.length === 0) {
        break
      }

      noteList.push(...notes)
      const nextCursor = (result.data as Record<string, unknown>).cursor as string | undefined
      const hasMore = Boolean((result.data as Record<string, unknown>).has_more)
      if (!nextCursor || !hasMore) {
        break
      }

      cursor = String(nextCursor)
    }

    return {
      success: true,
      msg: 'success',
      data: {
        noteList,
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async getNoteInfo(url: string, cookiesStr: string) {
    const { parsed, params } = parseUrlParams(url)
    const noteId = parsed.pathname.split('/').filter(Boolean).pop() ?? ''
    const api = '/api/sns/web/v1/feed'
    const data = {
      source_note_id: noteId,
      image_formats: ['jpg', 'webp', 'avif'],
      extra: {
        need_body_topic: '1',
      },
      xsec_source: params.xsec_source ?? 'pc_search',
      xsec_token: params.xsec_token ?? '',
    }
    const { headers, body } = buildRequestHeaders(cookiesStr, api, data, 'POST')
    return requestJson<Record<string, unknown>>(BASE_URL + api, {
      method: 'POST',
      headers,
      body,
    })
  }

  async getSearchKeyword(word: string, cookiesStr: string) {
    const api = '/api/sns/web/v1/search/recommend'
    const spliceApi = spliceStr(api, {
      keyword: word,
    })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async searchNote(
    query: string,
    cookiesStr: string,
    page = 1,
    sortTypeChoice = 0,
    noteType = 0,
    noteTime = 0,
    noteRange = 0,
    posDistance = 0,
    geo: Record<string, unknown> | string = '',
  ) {
    const api = '/api/sns/web/v1/search/notes'
    let sortType = 'general'
    if (sortTypeChoice === 1) sortType = 'time_descending'
    else if (sortTypeChoice === 2) sortType = 'popularity_descending'
    else if (sortTypeChoice === 3) sortType = 'comment_descending'
    else if (sortTypeChoice === 4) sortType = 'collect_descending'

    let filterNoteType = '不限'
    if (noteType === 1) filterNoteType = '视频笔记'
    else if (noteType === 2) filterNoteType = '普通笔记'

    let filterNoteTime = '不限'
    if (noteTime === 1) filterNoteTime = '一天内'
    else if (noteTime === 2) filterNoteTime = '一周内'
    else if (noteTime === 3) filterNoteTime = '半年内'

    let filterNoteRange = '不限'
    if (noteRange === 1) filterNoteRange = '已看过'
    else if (noteRange === 2) filterNoteRange = '未看过'
    else if (noteRange === 3) filterNoteRange = '已关注'

    let filterPosDistance = '不限'
    if (posDistance === 1) filterPosDistance = '同城'
    else if (posDistance === 2) filterPosDistance = '附近'

    const searchGeo = geo && typeof geo === 'string' ? geo : (geo ? JSON.stringify(geo) : '')
    const data = {
      keyword: query,
      page,
      page_size: 20,
      search_id: createHexId(21),
      sort: 'general',
      note_type: 0,
      ext_flags: [],
      filters: [
        { tags: [sortType], type: 'sort_type' },
        { tags: [filterNoteType], type: 'filter_note_type' },
        { tags: [filterNoteTime], type: 'filter_note_time' },
        { tags: [filterNoteRange], type: 'filter_note_range' },
        { tags: [filterPosDistance], type: 'filter_pos_distance' },
      ],
      geo: searchGeo,
      image_formats: ['jpg', 'webp', 'avif'],
    }
    const { headers, body } = buildRequestHeaders(cookiesStr, api, data, 'POST')
    return requestJson<Record<string, unknown>>(BASE_URL + api, {
      method: 'POST',
      headers,
      body,
    })
  }

  async searchSomeNote(
    query: string,
    requireNum: number,
    cookiesStr: string,
    sortTypeChoice = 0,
    noteType = 0,
    noteTime = 0,
    noteRange = 0,
    posDistance = 0,
    geo: Record<string, unknown> | string = '',
  ) {
    const noteList: unknown[] = []
    const pageResponses: RequestResult<Record<string, unknown>>[] = []
    let page = 1

    while (noteList.length < requireNum) {
      const result = await this.searchNote(query, cookiesStr, page, sortTypeChoice, noteType, noteTime, noteRange, posDistance, geo)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { noteList, pageResponses },
        }
      }

      const items = (result.data as Record<string, unknown>).items as unknown[] | undefined
      if (!items || items.length === 0) {
        break
      }

      noteList.push(...items)
      page += 1
      if (!(result.data as Record<string, unknown>).has_more || noteList.length >= requireNum) {
        break
      }
    }

    return {
      success: true,
      msg: 'success',
      data: {
        noteList: noteList.slice(0, requireNum),
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async searchUser(query: string, cookiesStr: string, page = 1) {
    const api = '/api/sns/web/v1/search/usersearch'
    const data = {
      search_user_request: {
        keyword: query,
        search_id: createFallbackId('search'),
        page,
        page_size: 15,
        biz_type: 'web_search_user',
        request_id: createFallbackId('request'),
      },
    }
    const { headers, body } = buildRequestHeaders(cookiesStr, api, data, 'POST')
    return requestJson<Record<string, unknown>>(BASE_URL + api, {
      method: 'POST',
      headers,
      body,
    })
  }

  async searchSomeUser(query: string, requireNum: number, cookiesStr: string) {
    const userList: unknown[] = []
    const pageResponses: RequestResult<Record<string, unknown>>[] = []
    let page = 1

    while (userList.length < requireNum) {
      const result = await this.searchUser(query, cookiesStr, page)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { userList, pageResponses },
        }
      }

      const users = (result.data as Record<string, unknown>).users as unknown[] | undefined
      if (!users || users.length === 0) {
        break
      }

      userList.push(...users)
      page += 1
      if (!(result.data as Record<string, unknown>).has_more || userList.length >= requireNum) {
        break
      }
    }

    return {
      success: true,
      msg: 'success',
      data: {
        userList: userList.slice(0, requireNum),
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async getNoteOutComment(noteId: string, cursor: string, xsecToken: string, cookiesStr: string) {
    const api = '/api/sns/web/v2/comment/page'
    const spliceApi = spliceStr(api, {
      note_id: noteId,
      cursor,
      top_comment_id: '',
      image_formats: 'jpg,webp,avif',
      xsec_token: xsecToken,
    })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async getNoteAllOutComment(noteId: string, xsecToken: string, cookiesStr: string) {
    const noteOutCommentList: unknown[] = []
    const pageResponses: RequestResult<Record<string, unknown>>[] = []
    let cursor = ''

    while (true) {
      const result = await this.getNoteOutComment(noteId, cursor, xsecToken, cookiesStr)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { noteOutCommentList, pageResponses },
        }
      }

      const comments = (result.data as Record<string, unknown>).comments as unknown[] | undefined
      if (!comments || comments.length === 0) {
        break
      }

      noteOutCommentList.push(...comments)
      const nextCursor = (result.data as Record<string, unknown>).cursor as string | undefined
      const hasMore = Boolean((result.data as Record<string, unknown>).has_more)
      if (!nextCursor || !hasMore) {
        break
      }

      cursor = String(nextCursor)
    }

    return {
      success: true,
      msg: 'success',
      data: {
        noteOutCommentList,
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async getNoteInnerComment(comment: Record<string, unknown>, cursor: string, xsecToken: string, cookiesStr: string) {
    const api = '/api/sns/web/v2/comment/sub/page'
    const spliceApi = spliceStr(api, {
      note_id: comment.note_id ?? '',
      root_comment_id: comment.id ?? '',
      num: '10',
      cursor,
      image_formats: 'jpg,webp,avif',
      top_comment_id: '',
      xsec_token: xsecToken,
    })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async getNoteAllInnerComment(comment: Record<string, unknown>, xsecToken: string, cookiesStr: string) {
    if (!comment.sub_comment_has_more) {
      return {
        success: true,
        msg: 'success',
        data: comment,
        rawText: JSON.stringify(comment),
        resJson: null,
      }
    }

    const innerCommentList: unknown[] = []
    let cursor = String(comment.sub_comment_cursor ?? '')

    while (true) {
      const result = await this.getNoteInnerComment(comment, cursor, xsecToken, cookiesStr)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: comment,
        }
      }

      const comments = (result.data as Record<string, unknown>).comments as unknown[] | undefined
      if (!comments || comments.length === 0) {
        break
      }

      innerCommentList.push(...comments)
      const nextCursor = (result.data as Record<string, unknown>).cursor as string | undefined
      if (!nextCursor || !(result.data as Record<string, unknown>).has_more) {
        break
      }

      cursor = String(nextCursor)
    }

    const nextComment = {
      ...comment,
      sub_comments: [...(Array.isArray(comment.sub_comments) ? comment.sub_comments : []), ...innerCommentList],
    }

    return {
      success: true,
      msg: 'success',
      data: nextComment,
      rawText: JSON.stringify(nextComment),
      resJson: null,
    }
  }

  async getNoteAllComment(url: string, cookiesStr: string) {
    const { parsed, params } = parseUrlParams(url)
    const noteId = extractLastPathSegment(parsed.pathname)
    const xsecToken = getStringParam(params, 'xsec_token')
    const topResult = await this.getNoteAllOutComment(noteId, xsecToken, cookiesStr)
    if (!topResult.success || !topResult.data) {
      return topResult
    }

    const outCommentList = (topResult.data as { noteOutCommentList: Record<string, unknown>[] }).noteOutCommentList ?? []
    const fullCommentList: Record<string, unknown>[] = []

    for (const comment of outCommentList) {
      const result = await this.getNoteAllInnerComment(comment, xsecToken, cookiesStr)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: fullCommentList,
        }
      }
      fullCommentList.push(result.data as Record<string, unknown>)
    }

    return {
      success: true,
      msg: 'success',
      data: fullCommentList,
      rawText: JSON.stringify(fullCommentList),
      resJson: null,
    }
  }

  async getUnreadMessage(cookiesStr: string) {
    const api = '/api/sns/web/unread_count'
    const { headers } = buildRequestHeaders(cookiesStr, api, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + api, {
      method: 'GET',
      headers,
    })
  }

  async getMetions(cursor: string, cookiesStr: string) {
    const api = '/api/sns/web/v1/you/mentions'
    const spliceApi = spliceStr(api, {
      num: '20',
      cursor,
    })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async getAllMetions(cookiesStr: string) {
    const metionsList: unknown[] = []
    const pageResponses: RequestResult<Record<string, unknown>>[] = []
    let cursor = ''

    while (true) {
      const result = await this.getMetions(cursor, cookiesStr)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { metionsList, pageResponses },
        }
      }

      const metions = (result.data as Record<string, unknown>).message_list as unknown[] | undefined
      if (!metions || metions.length === 0) {
        break
      }

      metionsList.push(...metions)
      const nextCursor = (result.data as Record<string, unknown>).cursor as string | undefined
      const hasMore = Boolean((result.data as Record<string, unknown>).has_more)
      if (!nextCursor || !hasMore) {
        break
      }

      cursor = String(nextCursor)
    }

    return {
      success: true,
      msg: 'success',
      data: {
        metionsList,
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async getLikesAndCollects(cursor: string, cookiesStr: string) {
    const api = '/api/sns/web/v1/you/likes'
    const spliceApi = spliceStr(api, {
      num: '20',
      cursor,
    })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async getAllLikesAndCollects(cookiesStr: string) {
    const likesAndCollectsList: unknown[] = []
    const pageResponses: RequestResult<Record<string, unknown>>[] = []
    let cursor = ''

    while (true) {
      const result = await this.getLikesAndCollects(cursor, cookiesStr)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { likesAndCollectsList, pageResponses },
        }
      }

      const likesAndCollects = (result.data as Record<string, unknown>).message_list as unknown[] | undefined
      if (!likesAndCollects || likesAndCollects.length === 0) {
        break
      }

      likesAndCollectsList.push(...likesAndCollects)
      const nextCursor = (result.data as Record<string, unknown>).cursor as string | undefined
      const hasMore = Boolean((result.data as Record<string, unknown>).has_more)
      if (!nextCursor || !hasMore) {
        break
      }

      cursor = String(nextCursor)
    }

    return {
      success: true,
      msg: 'success',
      data: {
        likesAndCollectsList,
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async getNewConnections(cursor: string, cookiesStr: string) {
    const api = '/api/sns/web/v1/you/connections'
    const spliceApi = spliceStr(api, {
      num: '20',
      cursor,
    })
    const { headers } = buildRequestHeaders(cookiesStr, spliceApi, '', 'GET')
    return requestJson<Record<string, unknown>>(BASE_URL + spliceApi, {
      method: 'GET',
      headers,
    })
  }

  async getAllNewConnections(cookiesStr: string) {
    const connectionsList: unknown[] = []
    const pageResponses: RequestResult<Record<string, unknown>>[] = []
    let cursor = ''

    while (true) {
      const result = await this.getNewConnections(cursor, cookiesStr)
      pageResponses.push(result)
      if (!result.success || !result.data) {
        return {
          ...result,
          data: { connectionsList, pageResponses },
        }
      }

      const connections = (result.data as Record<string, unknown>).message_list as unknown[] | undefined
      if (!connections || connections.length === 0) {
        break
      }

      connectionsList.push(...connections)
      const nextCursor = (result.data as Record<string, unknown>).cursor as string | undefined
      const hasMore = Boolean((result.data as Record<string, unknown>).has_more)
      if (!nextCursor || !hasMore) {
        break
      }

      cursor = String(nextCursor)
    }

    return {
      success: true,
      msg: 'success',
      data: {
        connectionsList,
        pageResponses,
      },
      rawText: JSON.stringify(pageResponses.map((item) => item.resJson)),
      resJson: null,
    }
  }

  async getNoteNoWaterVideo(noteId: string) {
    const url = `https://www.xiaohongshu.com/explore/${noteId}`
    const result = await fetchText(url, {
      method: 'GET',
      headers: {
        ...getCommonHeaders(),
      },
    })

    if (!result.ok) {
      return {
        success: false,
        msg: `HTTP ${result.status}`,
        data: null,
        rawText: result.text,
        resJson: null,
      }
    }

    const match = result.text.match(/<meta name="og:video" content="(.*?)">/)
    return {
      success: Boolean(match),
      msg: match ? 'success' : '未找到无水印视频地址',
      data: match ? match[1] : null,
      rawText: result.text,
      resJson: null,
    }
  }

  async getNoteNoWaterImg(imgUrl: string) {
    let newUrl = ''
    try {
      if (imgUrl.includes('notes_pre_post/')) {
        const token = `notes_pre_post/${imgUrl.split('notes_pre_post/', 1)[1].split('!', 1)[0].split('?', 1)[0]}`
        newUrl = `https://ci.xiaohongshu.com/${token}?imageView2/format/jpeg`
      } else if (imgUrl.includes('spectrum')) {
        const token = imgUrl.split('/').slice(-2).join('/').split('!', 1)[0].split('?', 1)[0]
        newUrl = `https://ci.xiaohongshu.com/${token}?imageView2/format/jpeg`
      } else if (imgUrl.includes('.jpg')) {
        const token = imgUrl.split('/').slice(-3).join('/').split('!', 1)[0].split('?', 1)[0]
        newUrl = `https://ci.xiaohongshu.com/${token}?imageView2/format/jpeg`
      } else {
        const token = imgUrl.split('/').pop()?.split('!', 1)[0].split('?', 1)[0] ?? ''
        newUrl = `https://ci.xiaohongshu.com/${token}?imageView2/format/jpeg`
      }
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : '解析失败',
        data: null,
        rawText: imgUrl,
        resJson: null,
      }
    }

    return {
      success: true,
      msg: 'success',
      data: newUrl,
      rawText: imgUrl,
      resJson: null,
    }
  }

  standardizeUserInfo(raw: unknown, userId = '') {
    if (!raw) {
      return buildFallbackArchive('user', '空数据', raw)
    }

    return standardizeUser(raw, userId)
  }

  standardizeNoteInfo(raw: unknown) {
    if (!raw) {
      return buildFallbackArchive('note', '空数据', raw)
    }

    return standardizeNote(raw)
  }

  standardizeCommentInfo(raw: unknown) {
    if (!raw) {
      return buildFallbackArchive('comment', '空数据', raw)
    }

    return standardizeComment(raw)
  }

  standardizeSearchNoteItems(items: unknown[]) {
    return standardizeSearchNotes(items)
  }

  standardizeSearchUserItems(items: unknown[]) {
    return standardizeSearchUsers(items)
  }
}

export const xhsPcApi = new XhsPcApi()
export { createFallbackId }
