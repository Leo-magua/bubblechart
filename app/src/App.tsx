import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router'

const ChartPage = lazy(() => import('@/pages/ChartPage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))

function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#121318]">
      <div className="text-sm text-white/60">加载中…</div>
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<ChartPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </Suspense>
  )
}
