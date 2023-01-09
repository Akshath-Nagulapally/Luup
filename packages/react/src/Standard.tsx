import { useEffect } from 'react'
import type { BotProps } from '@typebot.io/js'

type Props = BotProps

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'typebot-standard': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      >
    }
  }
}

export const Standard = (props: Props) => {
  useEffect(() => {
    ;(async () => {
      const { registerStandardComponent } = await import('@typebot.io/js')
      registerStandardComponent(props)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <typebot-standard />
}
