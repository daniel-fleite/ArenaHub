import type { Request, Response } from 'express'

export const getHealth = (req: Request, res: Response) => {
        res.status(200).json({
        message: "API do ArenaHub a todo vapor! 💨"
    })
}