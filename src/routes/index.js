import { Router } from "express";
import {
    authRequired,
    requireRole,
    requireSelfChoferOrRole,
} from "../middleware/auth.js";
import { upload } from "../config/cloudinary.js";

import * as auth from "../controllers/auth.controller.js";
import * as choferes from "../controllers/choferes.controller.js";
import * as recursos from "../controllers/recursos.controller.js";
import * as chequeos from "../controllers/chequeos.controller.js";
import * as registros from "../controllers/registros.controller.js";
import * as incentivos from "../controllers/incentivos.controller.js";
import * as catalogos from "../controllers/catalogos.controller.js"
import * as dashboard from "../controllers/dashboard.controller.js"
import * as mis from "../controllers/mis.controller.js"

const router = Router();

const w = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ======================================================
// AUTH
// ======================================================

router.post("/auth/login", w(auth.login));

router.get("/auth/me", authRequired, w(auth.me));

router.post("/auth/cambiar-password", authRequired, w(auth.cambiarPassword));

// ======================================================
// CHOFERES
// Supervisor: CRUD completo.
// Checador: puede consultar choferes para filtros/checks.
// Chofer: solo puede consultar su propio resumen.
// ======================================================

router.get(
    "/choferes",
    authRequired,
    requireRole("supervisor", "checador_unidad"),
    w(choferes.listar),
);

router.post(
    "/choferes",
    authRequired,
    requireRole("supervisor"),
    w(choferes.crear),
);

router.get(
    "/choferes/:id",
    authRequired,
    requireSelfChoferOrRole("id", "supervisor", "checador_unidad"),
    w(choferes.obtener),
);

router.get(
    "/choferes/:id/resumen",
    authRequired,
    requireSelfChoferOrRole("id", "supervisor", "checador_unidad"),
    w(choferes.resumen),
);

router.put(
    "/choferes/:id",
    authRequired,
    requireRole("supervisor"),
    w(choferes.actualizar),
);

router.delete(
    "/choferes/:id",
    authRequired,
    requireRole("supervisor"),
    w(choferes.eliminar),
);

router.post(
    "/choferes/:id/foto",
    authRequired,
    requireRole("supervisor"),
    upload.single("foto"),
    w(choferes.subirFoto),
);

// ======================================================
// UNIDADES
// Todos los roles pueden consultar unidades.
// Solo supervisor puede crear/editar/eliminar.
// ======================================================

router.get("/unidades", authRequired, w(recursos.listarUnidades));

router.get("/unidades/:id", authRequired, w(recursos.obtenerUnidad));

router.get("/unidades/:id/ultimo-km", authRequired, w(recursos.ultimoKm));

router.post(
    "/unidades",
    authRequired,
    requireRole("supervisor"),
    w(recursos.crearUnidad),
);

router.put(
    "/unidades/:id",
    authRequired,
    requireRole("supervisor"),
    w(recursos.actualizarUnidad),
);

router.delete(
    "/unidades/:id",
    authRequired,
    requireRole("supervisor"),
    w(recursos.eliminarUnidad),
);

// ======================================================
// RUTAS Y FACTORES
// Todos pueden consultar rutas.
// Solo supervisor puede editar factor de rendimiento.
// ======================================================

router.get("/rutas", authRequired, w(recursos.listarRutas));

router.put(
    "/rutas/:id/factor",
    authRequired,
    requireRole("supervisor"),
    w(recursos.actualizarFactorRuta),
);

// ======================================================
// HORARIOS
// Supervisor y checador pueden consultar.
// Solo supervisor puede asignar horarios.
// ======================================================

router.get(
    "/horarios",
    authRequired,
    requireRole("supervisor", "checador_unidad"),
    w(recursos.listarHorarios),
);

router.post(
    "/horarios",
    authRequired,
    requireRole("supervisor"),
    w(recursos.setHorario),
);

// ======================================================
// VERIFICACIONES
// Solo supervisor.
// ======================================================

router.get(
    "/verificaciones",
    authRequired,
    requireRole("supervisor"),
    w(recursos.listarVerificaciones),
);

router.get(
    "/verificaciones/proximas",
    authRequired,
    requireRole("supervisor"),
    w(recursos.proximasVerificaciones),
);

router.post(
    "/verificaciones",
    authRequired,
    requireRole("supervisor"),
    w(recursos.crearVerificacion),
);

router.put(
    "/verificaciones/:id",
    authRequired,
    requireRole("supervisor"),
    w(recursos.actualizarVerificacion),
);

router.delete(
    "/verificaciones/:id",
    authRequired,
    requireRole("supervisor"),
    w(recursos.eliminarVerificacion),
);

// ======================================================
// CHEQUEOS DE UNIDAD
// Chofer puede crear su check.
// Checador y supervisor pueden crear/revisar historial.
// ======================================================

router.get("/chequeos/catalogo", authRequired, w(chequeos.obtenerCatalogo));

router.get(
    "/chequeos/ultimo-chofer",
    authRequired,
    requireRole("supervisor", "checador_unidad"),
    w(chequeos.ultimoChequeoChofer),
);

router.get(
    "/chequeos",
    authRequired,
    requireRole("supervisor", "checador_unidad"),
    w(chequeos.listarChequeos),
);

router.get(
    "/chequeos/:id",
    authRequired,
    requireRole("supervisor", "checador_unidad"),
    w(chequeos.obtenerChequeo),
);

router.post(
    "/chequeos",
    authRequired,
    requireRole("supervisor", "checador_unidad", "chofer"),
    w(chequeos.crearChequeo),
);

router.post(
    "/chequeos/:id/fotos",
    authRequired,
    requireRole("supervisor", "checador_unidad", "chofer"),
    upload.array("fotos", 12),
    w(chequeos.subirFotos),
);

router.delete(
    "/chequeos/:id",
    authRequired,
    requireRole("supervisor"),
    w(chequeos.eliminarChequeo),
);

// REGISTROS DIARIOS
// Solo supervisor registra y consulta estos módulos.
router.get(
    "/rendimiento",
    authRequired,
    requireRole("supervisor"),
    w(registros.listarRendimiento),
);

router.post(
    "/rendimiento",
    authRequired,
    requireRole("supervisor"),
    w(registros.crearRendimiento),
);

router.delete(
    "/rendimiento/:id",
    authRequired,
    requireRole("supervisor"),
    w(registros.eliminarRendimiento),
);

router.get(
    "/puntualidad",
    authRequired,
    requireRole("supervisor"),
    w(registros.listarPuntualidad),
);

router.post(
    "/puntualidad",
    authRequired,
    requireRole("supervisor"),
    w(registros.crearPuntualidad),
);

router.get(
    "/servicio",
    authRequired,
    requireRole("supervisor"),
    w(registros.listarServicio),
);

router.post(
    "/servicio",
    authRequired,
    requireRole("supervisor"),
    w(registros.crearServicio),
);

router.get(
    "/limpieza",
    authRequired,
    requireRole("supervisor"),
    w(registros.listarLimpieza),
);

router.post(
    "/limpieza",
    authRequired,
    requireRole("supervisor"),
    w(registros.crearLimpieza),
);

// INCENTIVOS
// Supervisor consulta y recalcula todos.
// Chofer puede consultar preview propio.
router.get(
    "/incentivos",
    authRequired,
    requireRole("supervisor"),
    w(incentivos.listarIncentivos),
);

router.get(
    "/incentivos/preview/:chofer_id",
    authRequired,
    requireSelfChoferOrRole("chofer_id", "supervisor"),
    w(incentivos.previewChofer),
);

router.post(
    "/incentivos/recalcular",
    authRequired,
    requireRole("supervisor"),
    w(incentivos.recalcular),
);

// CATÁLOGOS GENERALES PARA FRONTEND
router.get(
  '/catalogos',
  authRequired,
  requireRole('supervisor', 'checador_unidad'),
  w(catalogos.obtenerCatalogos)
);

// DASHBOARD SUPERVISOR
router.get(
  '/dashboard/resumen',
  authRequired,
  requireRole('supervisor'),
  w(dashboard.resumenDashboard)
);

// MI INFORMACIÓN COMO CHOFER
router.get(
  '/mis-chequeos',
  authRequired,
  requireRole('chofer'),
  w(mis.misChequeos)
);

router.get(
  '/mis-chequeos/ultimo',
  authRequired,
  requireRole('chofer'),
  w(mis.miUltimoChequeo)
);

export default router;