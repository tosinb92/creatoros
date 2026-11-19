import Link from 'next/link';
import type {ReactNode} from 'react';

export default function StudioLayout({children}:{children:ReactNode}) {
  return <>{process.env.NEXT_PUBLIC_LINK_IMPORT==='on' &&
    <nav aria-label="Studio shortcuts"><Link href="/studio/from-link">Create clips from a link</Link> · <Link href="/studio">Studio home</Link></nav>}{children}</>;
}
