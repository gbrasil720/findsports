import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@findsports_oficial/ui/components/card'

export function AuthCard({
  title,
  footer,
  children
}: {
  title: string
  footer: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="mx-auto mt-10 w-full max-w-md rounded-xl">
      <CardHeader>
        <CardTitle className="text-center font-bold text-3xl">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter className="justify-center">{footer}</CardFooter>
    </Card>
  )
}
