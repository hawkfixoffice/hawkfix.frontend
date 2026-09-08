/** У облегчённой сборки lottie-web нет собственных типов.
 *  Объявляем ровно то, чем пользуемся: loadAnimation и destroy. */
declare module 'lottie-web/build/player/lottie_light.min.js' {
  import type { AnimationConfigWithData, AnimationItem } from 'lottie-web'
  const player: {
    loadAnimation(params: AnimationConfigWithData): AnimationItem
  }
  export default player
}
