import { Button, Group } from "@mantine/core"
import { NotificationData, notifications } from "@mantine/notifications"

interface NotificationWithButtonData extends NotificationData {
  buttonLabel: string
  buttonOnClick: () => void
}

export const showNotificationWithButton = ({
  buttonLabel,
  buttonOnClick,
  ...notificationData
}: NotificationWithButtonData) => {
  notifications.show({
    ...notificationData,
    message: (
      <Group gap="xs" justify="space-between">
        {notificationData.message}
        <Button
          onClick={buttonOnClick}
          size="compact-sm"
          styles={{
            label: {
              color: "var(--mantine-color-gradient-0)",
            },
          }}
          variant="transparent"
        >
          {buttonLabel}
        </Button>
      </Group>
    ),
  })
}
