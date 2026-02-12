import styled from "@emotion/styled"
import { Badge, DefaultMantineColor } from "@mantine/core"
import { FunctionComponent, ReactNode } from "react"

const ActionBadgeContainer = styled.div`
  position: absolute;
  right: 0;
  bottom: 30px;
  left: 0;
  width: 100%;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
`

type ActionBadgeProps = {
  children: ReactNode
  color?: DefaultMantineColor
}

const ActionBadge: FunctionComponent<ActionBadgeProps> = (props) => {
  return (
    <ActionBadgeContainer>
      <Badge
        c="dimmed"
        color={props.color ?? "dark"}
        size="sm"
        sx={{ overflow: "visible" }}
      >
        {props.children}
      </Badge>
    </ActionBadgeContainer>
  )
}

export default ActionBadge
