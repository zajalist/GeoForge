import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function sanitizeGpmlFileName(fileName) {
  const fallback = `gplates-input-${new Date().toISOString().replace(/[:.]/g, '-')}.gpml`
  if (typeof fileName !== 'string' || fileName.trim().length === 0) {
    return fallback
  }

  const trimmed = fileName.trim()
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_')
  const withExtension = safe.toLowerCase().endsWith('.gpml') ? safe : `${safe}.gpml`

  if (withExtension === '.gpml') {
    return fallback
  }
  return withExtension
}

export async function POST(request) {
  try {
    const body = await request.json()
    const gpmlContent = typeof body?.gpmlContent === 'string' ? body.gpmlContent : ''

    if (!gpmlContent.trim()) {
      return NextResponse.json({ error: 'gpmlContent is required.' }, { status: 400 })
    }

    const fileName = sanitizeGpmlFileName(body?.fileName)
    const gpmlDir = path.join(process.cwd(), 'public', 'gpml')
    const filePath = path.join(gpmlDir, fileName)
    const currentFilePath = path.join(gpmlDir, 'current.gpml')

    await fs.mkdir(gpmlDir, { recursive: true })
    await fs.writeFile(filePath, gpmlContent, 'utf8')
    await fs.writeFile(currentFilePath, gpmlContent, 'utf8')

    return NextResponse.json({
      ok: true,
      fileName,
      publicPath: `/gpml/${fileName}`,
      currentPath: '/gpml/current.gpml'
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: `Failed to persist GPML: ${error?.message || error}`
      },
      { status: 500 }
    )
  }
}
