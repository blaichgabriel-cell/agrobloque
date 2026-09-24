const normalizarCategoria = (valor = '') => String(valor)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()

export const categoriaProducto = (producto) => {
  const categoria = normalizarCategoria(producto?.categorias_producto?.nombre || producto?.categoria_nombre || '')
  const alias = {
    fungicidas: 'fungicida',
    insecticidas: 'insecticida',
    herbicidas: 'herbicida',
    coadyuvantes: 'coadyuvante',
    fertilizantes: 'fertilizante',
    foliares: 'foliar',
    hidrosolubles: 'hidrosoluble',
    'abonos de base': 'abono de base',
  }
  return alias[categoria] || categoria
}

export const esAbonoBase = (producto) => categoriaProducto(producto) === 'abono de base'

export const esProductoFumigacion = (producto) => [
  'fungicida',
  'insecticida',
  'herbicida',
  'coadyuvante',
].includes(categoriaProducto(producto))

export const esProductoFertilizacion = (producto) => [
  'fertilizante',
  'foliar',
  'hidrosoluble',
].includes(categoriaProducto(producto))

export const productoCorrespondeAplicacion = (producto, tipo) => {
  if (tipo === 'fumigacion') return esProductoFumigacion(producto)
  if (tipo === 'foliar') return categoriaProducto(producto) === 'foliar'
  if (tipo === 'fertiriego') return ['fertilizante', 'hidrosoluble'].includes(categoriaProducto(producto))
  return false
}

export const incluirSeleccionados = (productos, permitidos, idsSeleccionados = []) => {
  const ids = new Set(idsSeleccionados.filter(Boolean))
  return productos.filter(producto => permitidos(producto) || ids.has(producto.id))
}
