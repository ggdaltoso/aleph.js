import React, { Children, cloneElement, ComponentType, CSSProperties, isValidElement, MouseEvent, PropsWithChildren, ReactElement, useCallback, useEffect, useMemo, useState } from 'https://esm.sh/react'
import { redirect } from './aleph.ts'
import events from './events.ts'
import { useRouter } from './hooks.ts'
import util, { reModuleExt } from './util.ts'

const prefetchedPageModules = new Set<string>()

interface LinkProps {
    to: string
    replace?: boolean
    prefetch?: boolean
    className?: string
    style?: CSSProperties
}

export default function Link(props: PropsWithChildren<LinkProps>) {
    const { to, replace = false, prefetch: prefetchNow = false, className, style, children } = props
    const { pathname: currentPathname, query: currentQuery } = useRouter()
    const currentHref = useMemo(() => {
        return [currentPathname, currentQuery.toString()].filter(Boolean).join('?')
    }, [currentPathname, currentQuery])
    const href = useMemo(() => {
        if (util.isHttpUrl(to)) {
            return to
        }
        let [pathname, search] = util.splitBy(to, '?')
        if (pathname.startsWith('/')) {
            pathname = util.cleanPath(pathname)
        } else {
            pathname = util.cleanPath(currentPathname + '/' + pathname)
        }
        return [pathname, search].filter(Boolean).join('?')
    }, [currentPathname, to])
    const prefetch = useCallback(() => {
        if (!util.isHttpUrl(href) && href !== currentHref && !prefetchedPageModules.has(href)) {
            events.emit('fetch-page-module', { href })
            prefetchedPageModules.add(href)
        }
    }, [href, currentHref])
    const onClick = useCallback((e: MouseEvent) => {
        e.preventDefault()
        if (href !== currentHref) {
            redirect(href, replace)
        }
    }, [href, currentHref, replace])

    useEffect(() => {
        if (prefetchNow) {
            prefetch()
        }
    }, [prefetchNow, prefetch])

    if (Children.count(children) === 1) {
        const child = Children.toArray(children)[0]
        if (isValidElement(child) && child.type === 'a') {
            const { props } = child
            return cloneElement(child, {
                ...props,
                className: [className, props.className].filter(util.isNEString).join(' ') || undefined,
                style: Object.assign({}, style, props.style),
                href,
                'aria-current': props['aria-current'] || 'page',
                onClick: (e: MouseEvent) => {
                    if (util.isFunction(props.onClick)) {
                        props.onClick(e)
                    }
                    if (!e.defaultPrevented) {
                        onClick(e)
                    }
                },
                onMouseEnter: (e: MouseEvent) => {
                    if (util.isFunction(props.onMouseEnter)) {
                        props.onMouseEnter(e)
                    }
                    if (!e.defaultPrevented) {
                        prefetch()
                    }
                }
            })
        }
    }

    return React.createElement(
        'a',
        {
            className,
            style,
            href,
            onClick,
            onMouseEnter: prefetch,
            'aria-current': 'page'
        },
        children
    )
}

interface NavLinkProps extends LinkProps {
    activeClassName?: string
    activeStyle?: CSSProperties
}

export function NavLink(props: PropsWithChildren<NavLinkProps>) {
    const { activeClassName = 'active', activeStyle, to, ...rest } = props
    const { pathname: currentPathname } = useRouter()
    const pathname = useMemo(() => {
        if (util.isHttpUrl(to)) {
            return to
        }
        let [pathname] = util.splitBy(to, '?')
        if (pathname.startsWith('/')) {
            pathname = util.cleanPath(pathname)
        } else {
            pathname = util.cleanPath(currentPathname + '/' + pathname)
        }
        return pathname
    }, [currentPathname, to])

    if (currentPathname === pathname) {
        return React.createElement(
            Link,
            {
                ...rest,
                to,
                className: [rest.className?.trim(), activeClassName.trim()].filter(Boolean).join(' '),
                style: Object.assign({}, rest.style, activeStyle)
            }
        )
    }

    return React.createElement(Link, { ...rest, to })
}

interface ImportProps {
    from: string
    name?: string // default is 'default'
    props?: Record<string, any>
    fallback?: ReactElement
}

export function Import(props: ImportProps) {
    const { __importer, __sourceFile } = (props as any)
    const [error, setError] = useState<string | null>(null)
    const [mod, setMod] = useState<{ Component: ComponentType | null }>({ Component: null })

    useEffect(() => {
        if (reModuleExt.test(__sourceFile)) {
            const p = util.splitPath(__importer)
            p.pop()
            import(util.cleanPath('/_aleph/' + p.join('/') + '/' + props.from))
                .then(mod => {
                    const Component = mod[props.name || 'default']
                    if (util.isLikelyReactComponent(Component)) {
                        setMod({ Component })
                    } else {
                        setError(`component${props.name ? ` '${props.name}'` : ''} not found`)
                    }
                })
                .catch((err: Error) => {
                    setError(err.message)
                })
        }
    }, [__importer, __sourceFile])

    if (error) {
        return React.createElement('div', { style: { color: 'red' } }, error)
    }

    if (mod.Component) {
        return React.createElement(mod.Component, props.props)
    }

    if (reModuleExt.test(__sourceFile) && props.fallback) {
        return props.fallback
    }

    return null
}
