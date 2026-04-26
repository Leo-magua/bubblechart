import { Routes, Route } from 'react-router'
import ChartPage from '@/pages/ChartPage'
import AdminPage from '@/pages/AdminPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ChartPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  )
}
