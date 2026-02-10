# Plan de Implementación: SSO Login con Gmail

## 📋 Resumen Ejecutivo

Este documento describe el plan completo para implementar autenticación SSO (Single Sign-On) con Gmail en la aplicación Margn, manteniendo la compatibilidad con el sistema actual de magic links.

**Objetivo:** Permitir a los usuarios iniciar sesión con su cuenta de Google además de la opción actual de magic links.

**Impacto:** Mínimo en el backend (ya compatible), cambios principalmente en frontend y configuración de Supabase.

---

## 🎯 Alcance

### Incluido
- ✅ Configuración de Google OAuth en Supabase
- ✅ Botón "Sign in with Google" en la página de login
- ✅ Manejo del flujo OAuth completo
- ✅ Creación automática de usuarios en la base de datos local
- ✅ Compatibilidad con el sistema actual de magic links
- ✅ Manejo de errores y casos edge

### No Incluido (Futuro)
- ⏳ SSO con otros proveedores (GitHub, Microsoft, etc.)
- ⏳ Migración de usuarios existentes
- ⏳ Sincronización de datos de perfil desde Google

---

## 🏗️ Arquitectura Actual vs. Nueva

### Estado Actual
```
Usuario → Email → Magic Link → Supabase → JWT → Backend (verifySession)
```

### Estado Después de SSO
```
Usuario → [Email + Magic Link] O [Google OAuth] → Supabase → JWT → Backend (verifySession)
```

**Nota:** El backend no requiere cambios significativos ya que `verifySession` funciona con cualquier JWT válido de Supabase.

---

## 📝 Fase 1: Configuración de Google Cloud Console

### 1.1 Crear Proyecto en Google Cloud Console

**Pasos:**
1. Acceder a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear nuevo proyecto o seleccionar existente
3. Habilitar **Google+ API** (si no está habilitada)

### 1.2 Configurar OAuth Consent Screen

**Pasos:**
1. Ir a **APIs & Services** → **OAuth consent screen**
2. Seleccionar tipo de usuario:
   - **Internal** (solo para usuarios de tu organización)
   - **External** (para cualquier usuario de Google) ⭐ Recomendado
3. Completar información:
   - **App name:** Margn
   - **User support email:** tu-email@ejemplo.com
   - **Developer contact:** tu-email@ejemplo.com
4. Agregar scopes (opcional, mínimo requerido):
   - `email`
   - `profile`
   - `openid`
5. Agregar test users (si está en modo Testing)

### 1.3 Crear Credenciales OAuth 2.0

**Pasos:**
1. Ir a **APIs & Services** → **Credentials**
2. Click en **Create Credentials** → **OAuth client ID**
3. Seleccionar tipo: **Web application**
4. Configurar:
   - **Name:** Margn - Web Client
   - **Authorized JavaScript origins:**
     - `http://localhost:3002` (desarrollo)
     - `https://tu-dominio.vercel.app` (producción)
   - **Authorized redirect URIs:**
     - `https://uuxvjxdayeovhbduxmbu.supabase.co/auth/v1/callback` (Supabase callback)
     - `http://localhost:3002/auth/callback` (opcional, para desarrollo local)
5. Guardar y copiar:
   - **Client ID** (ej: `123456789-abc123.apps.googleusercontent.com`)
   - **Client Secret** (ej: `GOCSPX-abc123xyz`)

**⚠️ Importante:** Guardar estas credenciales de forma segura, se necesitarán en Supabase.

---

## 📝 Fase 2: Configuración en Supabase Dashboard

### 2.1 Habilitar Google Provider

**Pasos:**
1. Acceder a [Supabase Dashboard](https://supabase.com/dashboard)
2. Seleccionar proyecto: `uuxvjxdayeovhbduxmbu`
3. Ir a **Authentication** → **Providers**
4. Buscar **Google** y habilitarlo
5. Ingresar credenciales:
   - **Client ID (for OAuth):** [Client ID de Google Cloud]
   - **Client Secret (for OAuth):** [Client Secret de Google Cloud]
6. **Scopes:** Dejar por defecto (`email`, `profile`, `openid`)
7. **Save**

### 2.2 Configurar Redirect URLs

**Pasos:**
1. En **Authentication** → **URL Configuration**
2. Verificar **Site URL:**
   - Desarrollo: `http://localhost:3002`
   - Producción: `https://tu-dominio.vercel.app`
3. Verificar **Redirect URLs** incluye:
   - `http://localhost:3002/dashboard`
   - `https://tu-dominio.vercel.app/dashboard`
   - `http://localhost:3002/**` (wildcard para desarrollo)
   - `https://tu-dominio.vercel.app/**` (wildcard para producción)

### 2.3 Verificar Configuración de Email

**Pasos:**
1. En **Authentication** → **Settings**
2. Verificar que **Enable email confirmations** esté configurado según necesidad
3. Para OAuth, las confirmaciones de email no son necesarias (Google ya verifica)

---

## 📝 Fase 3: Cambios en Frontend

### 3.1 Actualizar AuthContext

**Archivo:** `apps/frontend/contexts/AuthContext.tsx`

**Cambios:**
1. Agregar método `signInWithGoogle()` al contexto
2. Implementar llamada a `supabase.auth.signInWithOAuth()`
3. Manejar el callback de OAuth

**Código a agregar:**

```typescript
interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>; // ⭐ Nuevo
  signOut: () => Promise<void>;
}

// Dentro de AuthProvider:
const signInWithGoogle = async () => {
  const redirectUrl = `${window.location.origin}/dashboard`;
  
  console.log(`[AuthContext] Initiating Google OAuth with redirect: ${redirectUrl}`);
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error(`[AuthContext] Error initiating Google OAuth:`, error);
    throw error;
  }
  // Note: No need to handle success here, the redirect will happen automatically
};
```

**Actualizar el Provider:**
```typescript
<AuthContext.Provider value={{ user, loading, signIn, signInWithGoogle, signOut }}>
```

### 3.2 Actualizar Página de Login

**Archivo:** `apps/frontend/pages/index.tsx`

**Cambios:**
1. Agregar botón "Sign in with Google"
2. Agregar separador visual entre opciones
3. Mantener el formulario de email existente
4. Manejar errores de OAuth

**Diseño sugerido:**
- Botón de Google arriba (más prominente)
- Separador "o" entre opciones
- Formulario de email abajo

**Código a agregar:**

```typescript
const { user, signIn, signInWithGoogle, loading } = useAuth(); // ⭐ Actualizar

const handleGoogleSignIn = async () => {
  setIsSubmitting(true);
  setError("");
  setMessage("");

  try {
    await signInWithGoogle();
    // No mostrar mensaje aquí, el redirect ocurrirá automáticamente
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Error al iniciar sesión con Google"
    );
    setIsSubmitting(false);
  }
};
```

**UI del botón Google:**
- Icono de Google (SVG o imagen)
- Texto: "Continuar con Google" / "Sign in with Google"
- Estilo consistente con el diseño actual (dark theme)

### 3.3 Manejar Callback de OAuth (Opcional)

**Nota:** Supabase maneja automáticamente el callback, pero podemos agregar una página de callback para mejor UX.

**Archivo:** `apps/frontend/pages/auth/callback.tsx` (nuevo)

**Propósito:** Mostrar loading mientras Supabase procesa el callback y redirige.

```typescript
// Página simple de loading mientras se procesa el callback
export default function AuthCallback() {
  useEffect(() => {
    // Supabase manejará el callback automáticamente
    // Esta página solo muestra loading
  }, []);

  return <div>Procesando autenticación...</div>;
}
```

---

## 📝 Fase 4: Verificación del Backend

### 4.1 Revisar AuthService

**Archivo:** `apps/backend/src/auth/auth.service.ts`

**Verificación:**
- ✅ `verifySession()` ya funciona con cualquier JWT de Supabase (incluyendo OAuth)
- ✅ `ensureUserExists()` ya crea usuarios automáticamente si no existen
- ✅ No requiere cambios

**Nota:** El JWT de Google OAuth tiene la misma estructura que el de magic links, por lo que el backend es completamente compatible.

### 4.2 Testing de Compatibilidad

**Casos a verificar:**
1. Usuario nuevo con Google → Se crea en DB automáticamente
2. Usuario existente con Google → Se encuentra por email
3. Token JWT de Google → Se decodifica correctamente
4. Expiración de token → Se maneja igual que magic links

---

## 📝 Fase 5: Testing

### 5.1 Testing Local

**Ambiente:**
- Frontend: `http://localhost:3002`
- Backend: `http://localhost:3003`
- Supabase: Proyecto de desarrollo

**Checklist:**
- [ ] Botón "Sign in with Google" aparece en login
- [ ] Click en botón redirige a Google
- [ ] Selección de cuenta Google funciona
- [ ] Callback redirige a `/dashboard`
- [ ] Usuario se crea en DB local automáticamente
- [ ] Token se guarda en localStorage
- [ ] Sesión persiste después de refresh
- [ ] Magic links siguen funcionando
- [ ] Sign out funciona correctamente

### 5.2 Testing de Producción

**Ambiente:**
- Frontend: Vercel (producción)
- Backend: Render/Railway (producción)
- Supabase: Proyecto de producción

**Checklist:**
- [ ] Redirect URLs configuradas correctamente
- [ ] OAuth funciona en producción
- [ ] No hay errores de CORS
- [ ] Tokens se generan correctamente
- [ ] Usuarios se crean en DB de producción

### 5.3 Casos Edge

**Verificar:**
- [ ] Usuario cancela OAuth en Google
- [ ] Usuario rechaza permisos
- [ ] Error de red durante OAuth
- [ ] Token expirado
- [ ] Usuario con email diferente al registrado

---

## 📝 Fase 6: Documentación

### 6.1 Actualizar README_LLM.md

**Sección a actualizar:** `## 🔐 Authentication and Authorization`

**Agregar:**
- Descripción del flujo OAuth con Google
- Instrucciones de configuración
- Variables de entorno (si aplica)

### 6.2 Actualizar env.example

**Archivo:** `apps/backend/env.example` y `apps/frontend/env.example`

**Verificar:**
- No se requieren nuevas variables (Supabase maneja todo)
- Documentar que Google OAuth se configura en Supabase Dashboard

### 6.3 Documentar para Usuarios

**Agregar en UI:**
- Tooltip o ayuda sobre "Sign in with Google"
- Mensaje de privacidad (qué datos se comparten con Google)

---

## 🚀 Plan de Implementación (Orden de Ejecución)

### Sprint 1: Configuración (1-2 horas)
1. ✅ Configurar Google Cloud Console
2. ✅ Configurar Supabase Dashboard
3. ✅ Verificar redirect URLs

### Sprint 2: Desarrollo Frontend (2-3 horas)
1. ✅ Actualizar `AuthContext.tsx` con `signInWithGoogle()`
2. ✅ Actualizar `index.tsx` con botón Google
3. ✅ Agregar estilos y separador visual
4. ✅ Crear página de callback (opcional)

### Sprint 3: Testing (1-2 horas)
1. ✅ Testing local completo
2. ✅ Testing de producción
3. ✅ Verificar casos edge
4. ✅ Verificar compatibilidad con magic links

### Sprint 4: Documentación (30 min)
1. ✅ Actualizar README_LLM.md
2. ✅ Agregar comentarios en código
3. ✅ Verificar env.example

**Tiempo total estimado:** 4-7 horas

---

## 🔒 Consideraciones de Seguridad

### 1. Credenciales OAuth
- ⚠️ **Nunca** commitear Client Secret en código
- ✅ Guardar en Supabase Dashboard (encriptado)
- ✅ Usar variables de entorno si es necesario

### 2. Redirect URLs
- ⚠️ Validar que solo URLs autorizadas estén configuradas
- ✅ No usar wildcards en producción (solo en desarrollo)

### 3. Tokens JWT
- ✅ El backend ya valida tokens correctamente
- ✅ Tokens expiran automáticamente
- ✅ No se almacenan en servidor

### 4. Privacidad
- ✅ Informar a usuarios qué datos se comparten
- ✅ Google solo comparte: email, nombre, foto (según scopes)
- ✅ No se comparten datos financieros con Google

---

## 🐛 Troubleshooting Común

### Error: "redirect_uri_mismatch"
**Causa:** Redirect URL no está en la lista autorizada de Google Cloud
**Solución:** Agregar URL exacta en Google Cloud Console → Credentials → OAuth 2.0 Client

### Error: "invalid_client"
**Causa:** Client ID o Secret incorrectos en Supabase
**Solución:** Verificar credenciales en Supabase Dashboard → Authentication → Providers → Google

### Error: Usuario no se crea en DB
**Causa:** `verifySession()` no se llama después de OAuth
**Solución:** Verificar que el callback redirige correctamente y que el frontend llama a `/api/auth/me`

### Error: CORS en producción
**Causa:** Supabase no tiene la URL de producción en redirect URLs
**Solución:** Agregar URL de producción en Supabase Dashboard → Authentication → URL Configuration

---

## 📊 Métricas de Éxito

### KPIs
- ✅ Usuarios pueden iniciar sesión con Google
- ✅ Tasa de éxito de OAuth > 95%
- ✅ Tiempo de autenticación < 5 segundos
- ✅ Magic links siguen funcionando
- ✅ No hay errores en producción

### Monitoreo
- Logs de Supabase Dashboard → Authentication → Logs
- Logs del backend para `verifySession()`
- Errores en frontend (console, Sentry si está configurado)

---

## 🔮 Mejoras Futuras

### Corto Plazo
- [ ] Agregar icono de Google más profesional
- [ ] Mejorar UX del callback (loading spinner)
- [ ] Agregar opción "Remember me" (si aplica)

### Mediano Plazo
- [ ] SSO con otros proveedores (GitHub, Microsoft)
- [ ] Sincronizar foto de perfil desde Google
- [ ] Sincronizar nombre completo desde Google

### Largo Plazo
- [ ] Migración de usuarios existentes a OAuth
- [ ] Análisis de preferencias de autenticación
- [ ] Soporte para múltiples métodos de autenticación por usuario

---

## ✅ Checklist Final

### Configuración
- [ ] Google Cloud Console configurado
- [ ] Supabase Dashboard configurado
- [ ] Redirect URLs verificadas

### Código
- [ ] `AuthContext.tsx` actualizado
- [ ] `index.tsx` actualizado con botón Google
- [ ] Estilos aplicados
- [ ] Manejo de errores implementado

### Testing
- [ ] Testing local completo
- [ ] Testing de producción
- [ ] Casos edge verificados
- [ ] Compatibilidad con magic links verificada

### Documentación
- [ ] README_LLM.md actualizado
- [ ] Comentarios en código
- [ ] env.example verificado

### Deployment
- [ ] Cambios en staging
- [ ] Testing en staging
- [ ] Deploy a producción
- [ ] Monitoreo post-deploy

---

## 📞 Contacto y Soporte

**Documentación de Referencia:**
- [Supabase Auth - OAuth Providers](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Supabase JavaScript Client - signInWithOAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)

**Última actualización:** Diciembre 2024  
**Versión del plan:** 1.0  
**Estado:** Listo para implementación


