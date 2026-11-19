const colors = {
  '墨绿色':'#1d3a2c', '黄绿色':'#879b27', '黄色':'#e2b83f',
  '棕黄色':'#b88a3d', '棕色':'#76502f', '黑色':'#252522',
  '灰白色':'#b8b8ad', '红色':'#a94036', '其他':'#a28e7b'
};

export function stoolColor(value) {
  return Object.hasOwn(colors, value)
    ? { label: `颜色：${value}`, swatch: colors[value] }
    : { label: '未记录颜色', swatch: null };
}
