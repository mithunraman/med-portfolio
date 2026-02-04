import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AuthProvider, ProtectedRoute } from '@/auth';
import { LoginPage, RegisterPage, DashboardPage } from '@/pages';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

export function App() {
  return (
    <MantineProvider>
      <Notifications position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </MantineProvider>
  );
}
