export default {
  routes: [
    {
      method: 'POST',
      path: '/ventas/crear-venta',
      handler: 'venta.crearVenta',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/ventas/cancelar-venta/:id',
      handler: 'venta.cancelarVenta',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

