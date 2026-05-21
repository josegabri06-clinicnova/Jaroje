# 🏨 Manual de Operaciones: Jaroje Hotel OS v1.2.0

Este manual detalla los procedimientos operativos, la arquitectura de seguridad, la gestión de roles y las directrices financieras para todo el personal de **Condominios Jaroje**.

---

## 🔒 1. Matriz de Roles, Accesos y PINs por Defecto

El sistema opera bajo un esquema de **Enrutamiento Hermético**. Cada rol tiene una vista específica y no puede acceder a las URL de otros paneles (cualquier intento redirige automáticamente a su sección permitida).

| Rol | PIN por Defecto | Secciones Permitidas | Descripción de Responsabilidades | Badge UI |
| :--- | :---: | :--- | :--- | :---: |
| **Administrador** | `1234` | **Acceso Universal** (`/`, `/finanzas`, `/analytics`, `/ajustes`, `/reservas`, etc.) | Dirección general, conciliación bancaria, control de nómina y analíticas de rentabilidad macro. | `Admin` (Gris Carbón) |
| **Recepción** | `0000` | `/recepcion`, `/calendario`, `/reservas`, `/precios`, `/nueva` | Registro de huéspedes, check-in, check-out, cobro de caja auxiliar y gestión de tarifas en Beds24. | `Recepción` (Azul Cobalto) |
| **Personal de Limpieza** | `5678` | `/staff`, `/calendario` | Reporte del estado físico de las habitaciones, checklist de aseo diario y entrega de turnos. | `Limpieza` (Ámbar) |
| **Mantenimiento** | `8765` | `/staff`, `/calendario` | Reparación de desperfectos, órdenes de trabajo técnico y reporte preventivo de unidades. | `Mantenimiento` (Carmesí) |

---

## 🛡️ 2. Sistema de Seguridad y PINs Dinámicos

### 🔑 Cambio Dinámico de PINs
El administrador puede cambiar dinámicamente las claves de los **cuatro roles** desde el panel de **Ajustes** (`/ajustes`).
1. Ve a **Ajustes > Seguridad y Acceso**.
2. Selecciona el PIN del rol que deseas modificar.
3. Introduce el **PIN actual**, el **nuevo PIN** (mínimo 4 dígitos numéricos) y confírmalo.
4. Presiona **Guardar**.
*El sistema sincronizará el nuevo PIN automáticamente en la base de datos de Supabase. El cambio se propaga en caliente a todos los dispositivos al instante.*

### 🔄 Sincronización en Caliente con Copiloto IA
Cuando se realiza un cambio de PIN en Ajustes, el sistema emite el evento global `sync-copilot`. Esto actualiza de forma silenciosa el estado del Copiloto IA sin necesidad de recargar la página, garantizando que el asistente de IA siempre valide con los datos más recientes.

---

## 💼 3. Caja de Seguridad y Flujo de Efectivo (`/finanzas`)

La sección `/finanzas` está resguardada por un **Muro Glassmorphic Tactil**. Requiere el PIN del Administrador para poder visualizar los saldos.

```
       ┌─────────────────────────────────────────┐
       │     Caja de Seguridad Bloqueada         │
       │   Ingresa el PIN de Administrador       │
       │                [ • • • • ]              │
       │                                         │
       │    [ 1 ]        [ 2 ]        [ 3 ]      │
       │    [ 4 ]        [ 5 ]        [ 6 ]      │
       │    [ 7 ]        [ 8 ]        [ 9 ]      │
       │                 [ 0 ]        [ ⌫ ]      │
       └─────────────────────────────────────────┘
```

### 📂 Gestión de Sobres Mensuales (Libro Contable)
Los fondos líquidos se administran a través de sobres físicos clasificados en grupos:
* **Efectivo:** Dinero líquido en pesos (MXN) para gastos operativos del hotel.
* **Bancos:** Cuentas corporativas sincronizadas.
* **Cuentas x Cobrar / Ahorros / Extranjero:** Fondos reservados de moneda extranjera (USD/EUR) y depósitos en tránsito.

### ➕ Registro Rápido de Movimientos
Para registrar un ingreso o egreso en un sobre:
1. Haz clic sobre el sobre correspondiente en la vista **Libro Contable**.
2. En la calculadora proyectada en tiempo real:
   * Introduce el **Monto**.
   * Observa la proyección automática (si es ingreso incrementa el balance; si es gasto lo deduce).
   * Selecciona el **Concepto / Categoría** y escribe la descripción.
3. Presiona **Registrar**.

### 🔗 Conciliación de Pagos con Beds24
Cuando se registra un pago de reserva en efectivo o tarjeta mediante la aplicación móvil:
1. El movimiento aparecerá en la sección **Registro** con el badge `Pendiente B24`.
2. Para subir el pago a Beds24 de forma permanente, haz clic en **Conciliar**.
3. Selecciona tu número de empleado en el modal táctil para auditar el movimiento.
4. El sistema subirá el pago a Beds24 mediante la API oficial y cambiará el estado local a `Sincronizado` (Verde).

---

## 📊 4. Consolidación Analítica de Rendimiento (`/analytics`)

La sección `/analytics` consolida y calcula la salud financiera del hotel mediante fórmulas estrictas libres de desfases:

### 🧮 Fórmulas Utilizadas
* **Ingresos Consolidados:** `Estimaciones de Beds24 (Habitaciones) + Ingresos Manuales de Caja (Tours, Mini-bar, Late Checkouts, Depósitos)`.
* **Utilidad Neta (Net Profit):** `Ingresos Consolidados - Egresos Totales (Gastos de Caja Supabase)`.
* **ADR (Average Daily Rate):** `Monto de Habitaciones Bruto (Beds24) / Noches Totales de Estancia`. *Nota: El ADR es un KPI exclusivo del rendimiento del inventario de habitaciones y no incluye ingresos de minibar/tours.*

### 📈 Gráficos del Dashboard
1. **Ingresos vs Egresos:** Comparativo de barras mes a mes que muestra el flujo total de entrada (negro) versus salida de dinero (rojo).
2. **Beneficio Neto Mensual:** Gráfico secundario que plasma la ganancia pura del negocio tras restar gastos:
   * **Barras Verdes (Ganancia):** Indican meses rentables donde la operación generó flujo neto positivo.
   * **Barras Rojas (Pérdida):** Indican meses con sobregiro de gastos operativos o bajo nivel de ocupación.

---

## 💬 5. Interacción con Jaroje AI Copilot

El chatbot inteligente flotante (`Sparkles`) tiene dos modos de operación automáticos según tus credenciales activas:

1. **Modo Consulta de Recepción (Sin PIN o Rol Recepcionista):**
   * El chatbot muestra el badge gris `Modo Consulta de Recepción`.
   * Puede consultar huéspedes en tránsito, habitaciones vacías, check-ins del día o consultar instrucciones de limpieza.
   * **Bloqueo de Datos Sensibles:** La IA no responderá a consultas sobre nóminas, balance total de sobres o gráficos de egresos.
2. **Acceso Financiero Sincronizado (Rol Admin + PIN validado):**
   * El chatbot muestra el badge verde esmeralda `Acceso Financiero Sincronizado`.
   * Puedes preguntarle de forma natural:
     * *"¿Cuánto dinero tenemos en total en el sobre de Efectivo?"*
     * *"¿Cuál fue el beneficio neto del mes pasado?"*
     * *"¿Cuál es la nómina de Sofía Alarcón de Recepción?"*

---

## 📝 6. Registro de Auditoría de Empleados (3 Dígitos)

Para cualquier acción que requiera responsabilidad directa (ej. conciliar con Beds24 o firmar el fin de turno), el sistema requiere ingresar el **Código de Empleado oficial de 3 dígitos**:

### 📋 Catálogo Oficial de Códigos de Empleado

#### 🔹 Recepción
* `101` - Sofía Alarcón
* `103` - Carlos Méndez
* `106` - Valeria Espinoza
* `108` - Alejandro Ruiz
* `110` - Mariana Ortiz
* `112` - Diana Benítez
* `202` - Roberto Salazar

#### 🔹 Mantenimiento
* `101` - Juan Carlos Peña
* `111` - Eduardo Gómez
* `202` - Roberto Salazar

#### 🔹 Limpieza
* `104` - María Elena Flores
* `105` - Juana Martínez
* `106` - Guadalupe Gómez
* `107` - Teresa Ramos
* `108` - Silvia Paredes
* `109` - Francisca Ruiz

---
*Jaroje Hotel OS · Diseñado con Estética Premium para Control Administrativo Absoluto.*
