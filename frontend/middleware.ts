import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('jobsy_token')?.value ||
                request.headers.get('authorization')?.replace('Bearer ', '')

  const pathname = request.nextUrl.pathname

  // Все /auth/* пути доступны всегда
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  // Для всех остальных путей требуется токен
  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
